require("dotenv").config();
const express=require("express");
const mongoose=require("mongoose");
const cookieParser=require("cookie-parser");
const cors=require("cors");
const auth=require("./routes/auth");
const document=require("./routes/documents");
const { createCollection , createDocumentCollection} = require("./utils/vectorDB")
const ask=require("./routes/ask");

const app=express();
app.use(express.json());
app.use(cookieParser());


//to check cors principle,without this cant send req to other origins
app.use(cors({
    origin:["http://localhost:3001","http://localhost:5173"],
    credentials:true//if not then cookies cant be send by browser(frontend) to backend
}));

//to check or to transfer req to different routes or paths
app.use("/api/auth",auth);
app.use("/api/documents",document);
app.use("/api/ask",ask)

//connection with mongodb database
mongoose.connect(process.env.MONGODB_URI).
then(async()=>{console.log("db connected");
      await createCollection()  ;
      await createDocumentCollection();
     console.log("Qdrant collections ready");
})
.catch((err)=>{
    console.log("error:", err);
})


app.listen(process.env.PORT || 5000,()=>{
    console.log("server connected");
});