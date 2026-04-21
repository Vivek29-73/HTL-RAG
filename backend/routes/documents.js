//for all utils to conncet
const express=require("express");
const router=express.Router();
const multer = require("multer")
const protect=require("../middleware/auth");
const Document = require("../models/document");
const {extractText}=require("../utils/extractor");
const {validateDocument}=require("../utils/validator");
const chunkText=require("../utils/chunker");
const {embedChunks}=require("../utils/embedder");
const { storeChunks, deleteDocumentChunks, storeDocumentVector, deleteDocumentVector, searchDocuments } = require("../utils/vectorDB")
const { generateEmbeddings } = require("../utils/embedder")
const { validateQuery } = require("../utils/validator")
//multer setup
const upload=multer({
    dest:"uploads/",
    limits:{
        fileSize:10*1024*1024,//10 mb limit 
        files:10
    }//dest:uploads will save file temporary 
    //runs before router so that all files are stored before route calling
})

//UPLOAD route

router.post("/upload",protect,upload.array("documents",10),async(req,res)=>{
    try{
        const files=req.files;
        const userId=req.user._id.toString();

        console.log(`uplaod from userid${userId} and files are ${files ? files.length:0} `)
         
        if(!files || files.length===0){
            return res.status(400).json({error: "no files uploaded"});
        }
        const results=[];
        const errors=[];

        //process each file one by one
   
        for(const file of files){

            try{
                //for taking rest time by the minilmv2 embeeder for another file
         await new Promise(resolve=>setTimeout(resolve,500))

                const extracted=await extractText(file);
              
                validateDocument(extracted.text);

                const doc=await Document.create({
                    userId:userId,
                    filename:extracted.filename,
                    status:"processing"
                })

                const chunks=chunkText(extracted.text,extracted.filename);

                const embeddedChunks=await embedChunks(chunks);

                await storeChunks(embeddedChunks,userId,doc._id.toString());
                
                // stores ONE vector representing whole document
                   await storeDocumentVector(
                    userId,
                    doc._id.toString(),
                    extracted.filename,
                    embeddedChunks
                )

                await Document.findByIdAndUpdate(doc._id,{
                    status:"ready",
                    totalChunks:chunks.length
                })

                results.push({
                    filename:extracted.filename,
                    totalChunks:chunks.length,
                    status:"success"
                })
            }catch(fileError){//of one file fail ,continue other files processing
                errors.push({
                    filename:file.originalname,
                    error:fileError.message
                })
                
            }
            
        }
        res.json({
            success:true,
            processed:results,
            failed:errors,
            message: `${results.length} files uploaded, ${errors.length} failed`
        })
    }catch(err){
        res.status(500).json({error: err.message})
    }
});

// SEARCH DOCUMENTS ROUTE 
router.post("/search", protect, async(req, res) => {
    try {
        const { query } = req.body
        const userId = req.user._id.toString()

        if(!query || query.trim().length === 0) {
            return res.status(400).json({ error: "please enter a search query" })
        }

        //validate query
        const cleanQuery = validateQuery(query)

        // convert query to vector
        const queryVector = await generateEmbeddings(cleanQuery)
    
      // search document_index collection
        const topDocuments = await searchDocuments(queryVector, userId, 5)
        // not chunks — whole documents
        // filtered by userId

        if(topDocuments.length === 0) {
            return res.json({
                documents: [],
                message: "no relevant documents found. please upload documents first"
            })
        }

        res.json({
            documents: topDocuments
            // returns array of:
            // { documentId, filename, totalChunks, score }
        })

    } catch(err) {
        res.status(500).json({ error: err.message })
    }
})



router.get("/my-documents", protect, async(req, res) => {
    try {
      

        const docs = await Document.find({
            userId: req.user._id,
            status: "ready"
            // only return documents that finished processing
            // processing or failed documents not shown
        }).sort({ createdAt: -1 })
        // sort newest first
        // -1 means descending order

        

        res.json({ documents: docs })

    } catch(err) {
        console.log("get documents error:", err.message)
        res.status(500).json({ error: err.message })
    }
});




// DELETE A DOCUMENT
router.delete("/:documentId", protect, async(req, res) => {
    try {
        const documentId = req.params.documentId
        // req.params.documentId gets the ID from the URL
        // example URL: DELETE /api/documents/64abc123
       
       

        // find document in MongoDB
        const doc = await Document.findById(documentId)
        if(!doc){
            return res.status(404).json({ error: "document not found" })
        }

        // verify this document belongs to logged in user
        if(doc.userId.toString() !== req.user._id.toString()){
            return res.status(403).json({ error: "not authorized" })

            // prevents user A deleting user B's documents
        }

        // delete chunks from Qdrant first
        await deleteDocumentChunks(documentId)

      // delete document vector from Qdrant 
        await deleteDocumentVector(documentId)//if not delete both doc and chunk vector,still show result relate to iyyt
      

        // then delete record from MongoDB
        await Document.findByIdAndDelete(documentId)
        

        res.json({ success: true, message: "document deleted" })

    } catch(err) {
        
        res.status(500).json({ error: err.message })
    }
})

module.exports = router
