const { QdrantClient } = require("@qdrant/js-client-rest")

const qdrant = new QdrantClient({
    host: "localhost",
    port: 6333
})

const COLLECTION = "HTL-Documents"
// this collection stores CHUNKS


const DOC_COLLECTION = "document_index"
// this NEW collection stores DOCUMENT vectors one vect for doc

// CREATE CHUNKS COLLECTION 
async function createCollection() {
    try {
        const collections = await qdrant.getCollections()
        const exists = collections.collections.find(
            c => c.name === COLLECTION
        )

        if(!exists) {
            await qdrant.createCollection(COLLECTION, {
                vectors: {
                    size: 384,
                    distance: "Cosine"
                }
            })
            console.log("qdrant chunks collection created")
        } else {
            console.log("qdrant chunks collection already exists")
        }
    } catch(err) {
        console.log("qdrant error:", err.message)
    }
}

// CREATE DOCUMENT INDEX COLLECTION 
async function createDocumentCollection() {
    // to store one vector per whole document
    try {
        const collections = await qdrant.getCollections()
        const exists = collections.collections.find(
            c => c.name === DOC_COLLECTION
        )

        if(!exists) {
            await qdrant.createCollection(DOC_COLLECTION, {
                vectors: {
                    size: 384,
                    // same size as chunks because
                    // we use same MiniLM model
                    distance: "Cosine"
                }
            })
            console.log("qdrant document index collection created")
        } else {
            console.log("qdrant document index collection already exists")
        }
    } catch(err) {
        console.log("qdrant doc collection error:", err.message)
    }
}

// STORE CHUNKS
async function storeChunks(embeddedChunks, userId, documentId) {
    const points = embeddedChunks.map((chunk, i) => ({
        id: Date.now() + i,
        vector: chunk.vector,
        payload: {
            text: chunk.text,
            source: chunk.source,
            chunkIndex: chunk.chunkIndex,
            userId: userId,
            documentId: documentId
        }
    }))

    await qdrant.upsert(COLLECTION, { points })
}


// STORE DOCUMENT VECTOR for docs 
async function storeDocumentVector(userId, documentId, filename, embeddedChunks) {
    //after storing chunk we calculate average of chunks represing the documeng ehich stored in Doc_Collectiom
  
    const totalChunks = embeddedChunks.length

    const documentVector = embeddedChunks[0].vector.map((_, dimensionIndex) => {
        const sum = embeddedChunks.reduce((total, chunk) => {
            return total + chunk.vector[dimensionIndex]
        }, 0)
        return sum / totalChunks
    })
    // example with 3 dimensionsns and 2 chunks:
    // chunk1 vector: [0.2, 0.4, 0.1] chunk2 vector: [0.4, 0.2, 0.3]
    // document vector: [0.3, 0.3, 0.2] (averaged)

    // store in document_index collection
    await qdrant.upsert(DOC_COLLECTION, {
        points: [{
            id: Date.now(),
            vector: documentVector,
            payload: {
                documentId: documentId,
                userId: userId,
                filename: filename,
                totalChunks: totalChunks
            }
        }]
    })
}

// SEARCH CHUNKS 
async function searchChunks(queryVector, userId, limit = 5) {
    const results = await qdrant.search(COLLECTION, {
        vector: queryVector,
        limit: limit,
        withPayload: true,
        withVector: true,
        filter: {
            must: [{
                key: "userId",
                match: { value: userId }
            }]
        }
    })

    return results.map(result => ({
        text: result.payload.text,
        source: result.payload.source,
        score: result.score,
        chunkIndex: result.payload.chunkIndex,
        vector: result.vector
    }))
}


// SEARCH DOCUMENTS
async function searchDocuments(queryVector, userId, limit = 5) {
    // this searches document_index collection & returns top 5 most relevant DOCUMENTS


    const results = await qdrant.search(DOC_COLLECTION, {
        vector: queryVector,
        limit: limit,
        withPayload: true,
        filter: {
            must: [{
                key: "userId",
                match: { value: userId }
                // only return THIS user's documents
            }]
        }
    })

    return results.map(result => ({
        documentId: result.payload.documentId,
        filename: result.payload.filename,
        totalChunks: result.payload.totalChunks,
        score: result.score
    }))
}


// SEARCH CHUNKS FROM SPECIFIC DOCUMENTS 
async function searchChunksFromDocs(queryVector, userId, documentIds, limit = 3) {
// user has selected specific documents we only search chunks from THOSE documents

    const results = await qdrant.search(COLLECTION, {
        vector: queryVector,
        limit: limit,
        withPayload: true,
        withVector: true,
        filter: {
            must: [
                {
                    key: "userId",
                    match: { value: userId }
                },
                {
                    key: "documentId",
                    match: {
                        any: documentIds
                        // only search chunks wth documentId
                    }
                }
            ]
        }
    })

    return results.map(result => ({
        text: result.payload.text,
        source: result.payload.source,
        score: result.score,
        chunkIndex: result.payload.chunkIndex,
        vector: result.vector
    }))
}

// DELETE DOCUMENT CHUNKS
async function deleteDocumentChunks(documentId) {

    await qdrant.delete(COLLECTION, {
        filter: {
            must: [{
                key: "documentId",
                match: { value: documentId }
            }]
        }
    })
}


// DELETE DOCUMENT VECTOR (new)
async function deleteDocumentVector(documentId) {
    // when user deletes a document we need to delete from BOTH collections
    // chunks collection AND document_index collection without this document still appears in search
    // even after user deletes it
    await qdrant.delete(DOC_COLLECTION, {
        filter: {
            must: [{
                key: "documentId",
                match: { value: documentId }
            }]
        }
    })
}

module.exports = {
    createCollection,
    createDocumentCollection,
    storeChunks,
    storeDocumentVector,
    searchChunks,
    searchDocuments,
    searchChunksFromDocs,
    deleteDocumentChunks,
    deleteDocumentVector
}