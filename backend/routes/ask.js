const express=require("express");
const router=express.Router();
const protect=require("../middleware/auth")
const {validateQuery}=require("../utils/validator");
const {generateEmbeddings}=require("../utils/embedder");
const {searchChunks, searchChunksFromDocs}=require("../utils/vectorDB")
const {askLLM}=require("../utils/llm")
const History=require("../models/history");

//api/ask/  route
router.post("/",protect,async(req,res)=>{
    try{
        const {question}=req.body;
        const userId=req.user._id.toString()

        //validate question
        const cleanQuestion=validateQuery(question);

        //Embedding  the question
        const questionVector=await generateEmbeddings(cleanQuestion);
        
        //search for relavant chunks top 3,filtered by uder id
        const relevantChunks=await searchChunks(questionVector,userId,3);
    
        if(relevantChunks.length===0){
            return res.json({
                answer:"No relevant information found in your documents. Please upload document first",
                source:[]
            })
        }

        //get answer from LLM

        const answer=await askLLM(cleanQuestion,relevantChunks);//sends question + relevant(top 5 chunks)
        
        const sources=relevantChunks.map((chunk)=>({
                filename:chunk.source,
                score:chunk.score
            }))

            //save to mongodb after getting the answer
        await History.create({
            userId:req.user._id,//object directly(not toString)
            question:cleanQuestion,
            answer:answer,
            sources:sources
        })

        //sent respose to frontened
        res.json({
            answer:answer,
            sources:sources
            })//display "Answer from HR_Policy.pdf"
      
    }catch(err){
        res.status(500).json({error:err.message})
    }
});

//api/ask/hsitory->route

router.get("/history",protect,async(req,res)=>{
    try{
        //find all conversation for this user

        const history=await History.find({userId:req.user._id})
        .sort({createdAt:-1})//newest first
        .limit(20);
    
        res.json({history});
    }catch(err){
        res.status(500).json({error:err.message});
    }
});

module.exports=router;