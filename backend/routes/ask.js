const express = require("express")
const router = express.Router()
const protect = require("../middleware/auth")
const { validateQuery } = require("../utils/validator")
const { generateEmbeddings } = require("../utils/embedder")
const { searchChunks, searchChunksFromDocs } = require("../utils/vectorDB")
//                     ↑ new import for System 2
const { askLLM } = require("../utils/llm")
const History = require("../models/history")

// =============================================
// VARIANCE CALCULATION FUNCTION
// =============================================
function cosineSimilarity(vecA, vecB) {
    // calculates how similar two vectors are
    // returns number between 0 and 1
    // 1 = identical direction = same meaning
    // 0 = completely different direction = different meaning

    // dot product = multiply each dimension and sum
    const dotProduct = vecA.reduce((sum, a, i) => sum + a * vecB[i], 0)

    // magnitude = length of each vector
    const magA = Math.sqrt(vecA.reduce((sum, a) => sum + a * a, 0))
    const magB = Math.sqrt(vecB.reduce((sum, b) => sum + b * b, 0))

    if(magA === 0 || magB === 0) return 0
    // prevent division by zero

    return dotProduct / (magA * magB)
}

function calculateVariance(chunks) {
    // WHY: we compare every chunk against every other chunk
    // to see if they are talking about same thing
    // or contradicting each other
    //
    // example with 3 chunks:
    // chunk0 vs chunk1
    // chunk0 vs chunk2
    // chunk1 vs chunk2
    // = 3 pairwise comparisons

    if(chunks.length < 2) return 0
    // need at least 2 chunks to compare
    // if only 1 chunk no conflict possible

    const scores = []

    for(let i = 0; i < chunks.length; i++) {
        for(let j = i + 1; j < chunks.length; j++) {
            // compare chunk i against chunk j
            // i+1 prevents comparing chunk with itself
            // and prevents duplicate comparisons

            if(chunks[i].vector && chunks[j].vector) {
                const similarity = cosineSimilarity(
                    chunks[i].vector,
                    chunks[j].vector
                )
                scores.push(similarity)
            }
        }
    }

    if(scores.length === 0) return 0

    // calculate mean of all similarity scores
    const mean = scores.reduce((a, b) => a + b, 0) / scores.length

    // calculate variance
    // variance = average of squared differences from mean
    // high variance = scores are spread out = chunks disagree
    // low variance = scores are close together = chunks agree
    const variance = scores.reduce((sum, score) =>
        sum + Math.pow(score - mean, 2), 0
    ) / scores.length

    return variance
}

// =============================================
// MAIN ASK ROUTE
// =============================================
router.post("/", protect, async(req, res) => {
    try {
        const { question, mode, documentIds } = req.body
        // question = what user typed
        // mode = "simple" OR "from-docs" OR "smart"
        //        simple   = System 1 (default)
        //        from-docs = System 2
        //        smart    = System 3
        // documentIds = array of selected doc IDs
        //               only used in mode "from-docs"

        const userId = req.user._id.toString()

        // STEP 1 — validate question
        const cleanQuestion = validateQuery(question)

        // STEP 2 — embed question to vector
        const questionVector = await generateEmbeddings(cleanQuestion)
  
        if(mode === "from-docs") {
  // user selected which documents to use
 

            if(!documentIds || documentIds.length === 0) {
                return res.status(400).json({
                    error: "please select at least one document"
                })
            }

            // search chunks but ONLY from selected documents
            const relevantChunks = await searchChunksFromDocs(
                questionVector,
                userId,
                documentIds,
                3
            )

            if(relevantChunks.length === 0) {
                return res.json({
                    answer: "could not find relevant information in the selected documents",
                    sources: [],
                    mode: "from-docs"
                })
            }

            // get answer from LLM using only selected doc chunks
            const answer = await askLLM(cleanQuestion, relevantChunks)

            // save to history
            await History.create({
                userId: req.user._id,
                question: cleanQuestion,
                answer: answer,
                sources: relevantChunks.map(chunk => ({
                    filename: chunk.source,
                    score: chunk.score
                }))
            })

            return res.json({
                answer: answer,
                sources: relevantChunks.map(chunk => ({
                    filename: chunk.source,
                    score: chunk.score
                })),
                mode: "from-docs"
            })
        }


        if(mode === "smart") {
    const relevantChunks = await searchChunks(
        questionVector,
        userId,
        3
    )

    if(relevantChunks.length === 0) {
        return res.json({
            answer: "no relevant information found",
            sources: [],
            mode: "smart"
        })
    }

    // CHECK 1 — calculate variance
    const variance = calculateVariance(relevantChunks)
    console.log(`variance: ${variance.toFixed(4)}`)

    // CHECK 2 — count unique source documents
    const uniqueSources = [...new Set(
        relevantChunks.map(chunk => chunk.source)
    )]
    const hasMultipleSources = uniqueSources.length > 1
    // if chunks come from different documents
    // there is a chance of conflicting information

    console.log(`unique sources: ${uniqueSources.length}`)
    console.log(`sources: ${uniqueSources}`)

    // CONFLICT DETECTION — either condition triggers it
    const VARIANCE_THRESHOLD = 0.05

    const conflictDetected =
        hasMultipleSources &&
        // chunks from different documents ✅
        variance < 0.15
        // AND chunks are on same topic (similar vectors)
        // meaning they are answering same question
        // but possibly with different answers
        // low variance = same topic
        // multiple sources = different documents
        // COMBINATION = likely conflict ✅

    // WHY this logic:
    // same topic from different docs = possible conflict
    // different topic from different docs = no conflict
    // same topic from same doc = no conflict

    if(conflictDetected) {
        return res.json({
            confused: true,
            variance: variance.toFixed(4),
            message: "I found information from multiple documents on this topic. They may have conflicting answers.",
            conflictingDocuments: uniqueSources,
            chunks: relevantChunks.map(chunk => ({
                source: chunk.source,
                preview: chunk.text.slice(0, 150),
                score: chunk.score
            })),
            mode: "smart"
        })
    }

    // no conflict — answer directly
    const answer = await askLLM(cleanQuestion, relevantChunks)

    await History.create({
        userId: req.user._id,
        question: cleanQuestion,
        answer: answer,
        sources: relevantChunks.map(chunk => ({
            filename: chunk.source,
            score: chunk.score
        }))
    })

    return res.json({
        answer: answer,
        sources: relevantChunks.map(chunk => ({
            filename: chunk.source,
            score: chunk.score
        })),
        variance: variance.toFixed(4),
        confident: true,
        mode: "smart"
    })
}
        // this runs when mode is "simple" or not provided
        const relevantChunks = await searchChunks(
            questionVector,
            userId,
            3
        )

        if(relevantChunks.length === 0) {
            return res.json({
                answer: "no relevant information found in your documents. please upload documents first",
                sources: [],
                mode: "simple"
            })
        }

        const answer = await askLLM(cleanQuestion, relevantChunks)

        // save to history
        await History.create({
            userId: req.user._id,
            question: cleanQuestion,
            answer: answer,
            sources: relevantChunks.map(chunk => ({
                filename: chunk.source,
                score: chunk.score
            }))
        })

        res.json({
            answer: answer,
            sources: relevantChunks.map(chunk => ({
                filename: chunk.source,
                score: chunk.score
            })),
            mode: "simple"
        })

    } catch(err) {
        res.status(500).json({ error: err.message })
    }
})

router.get("/history", protect, async(req, res) => {
    try {
        const history = await History.find({ userId: req.user._id })
            .sort({ createdAt: -1 })
            .limit(20)

        res.json({ history })
    } catch(err) {
        res.status(500).json({ error: err.message })
    }
})

module.exports = router