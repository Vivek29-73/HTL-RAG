const { QdrantClient}=require("@qdrant/js-client-rest");

//connect to quadrant running locally via docker

const qdrant =new QdrantClient({
    host:"localhost",//qdrant running on your machine ,port 6333 qdarant default port
    port:6333
});

const COLLECTION="HTL-Documents";//all chunks store here separated by uder id

async function createCollection(){
    try{
        const collections=await qdrant.getCollections();// getCollections() returns list of all collections
        const exists=collections.collections.find(
            c=>c.name===COLLECTION // find() checks if our collection is already there if yes skip creation of collecction
        )

        if(!exists){
            await qdrant.createCollection(COLLECTION,{
                vectors:{
                    size:384,//as vector produces 384 no.
                    distance:"Cosine"//angle bw two vec,small angle =>more similar meaning
                }
            })
          
        }
        else {
            console.log("Qdrant collection already exists");
        }
        }
        catch(err){
            console.log("qdrant error:",err.message)
        }
    }


//store chunks
async function storeChunks(embeddedChunks,userId,documentId){

    const points=embeddedChunks.map((chunk,i)=>({
        id: Date.now()+i, 
           //for uniqueID creation,,written in doc_details
        vector:chunk.vector,
         //each chunk i.e extracted  by embeddedchunks.map to iterate over embeddedchunks
        payload:{//metadta alongside vector
            text:chunk.text,
            source:chunk.source,
            chunkIndex:chunk.chunkIndex,
            userId:userId,
            documentId:documentId
        }
    }))

    await qdrant.upsert(COLLECTION,{points})//upsert = insert if new, update if exists
}

async function searchChunks(queryVector,userId,limit=5) {
    const results=await qdrant.search(COLLECTION,{
        vector:queryVector,//question converted to 384 no.,qdrant find whose vector are close to this
        limit:limit, //top 5 simialr chunks
        withPayload:true,
        withVector:true,//return actual 384 numbers needed for syst3 variance cheeck among chunks embeddings
        filter:{
            must:[{
                key:"userId",
                match:{value:userId}// only search THIS user's chunks
            }]                      // without this filter every user sees everyone's data
        }
    
    })

    return results.map(result=>({
        text:result.payload.text,
        source:result.payload.source,
        score:result.score ,// score = similarity between 0 and 1
                            // 1 = identical meaning
                            // 0 = completely unrelated
        chunkIndex: result.payload.chunkIndex,//positin of chunk in doc ,used to show where ans come from
        vector: result.vector //for comparing chunks in sys three
    }))

    
}


//delete docs chunks when user deletes a doc
async function deleteDocumentChunks(documentId) {

    await qdrant.delete(COLLECTION,{
        filter:{
            must:[{
                key:"documentId",
                match:{value:documentId}
            }]
        }
    })
    
}

module.exports={createCollection,storeChunks,searchChunks,deleteDocumentChunks};

