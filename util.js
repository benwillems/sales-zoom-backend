// const { OpenAI, toFile } = require('openai');
// const pdfjsLib = require('pdfjs-dist/build/pdf.js');
// const fs = require('fs');
// const path = require('path');
// const axios = require('axios');
// const { PineconeClient } = require("@pinecone-database/pinecone");
// const { PDFDocument } = require('pdf-lib');
// const AWS = require('aws-sdk');
// const { v4: uuidv4 } = require('uuid');

// AWS.config.update({
//     accessKeyId: process.env.AWS_ACCESS_KEY_ID,
//     secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
//     region: 'us-west-2'  // e.g., 'us-west-1'
// });
// const s3 = new AWS.S3();
// const openai = new OpenAI({
//     apiKey: process.env['OPENAI_API_KEY'], // This is the default and can be omitted
// });

// async function extractTextFromPdf(filePath) {
//   let data = new Uint8Array(fs.readFileSync(filePath));
//   let pdf = await pdfjsLib.getDocument({data: data}).promise;
//   let pages = [];
//   for (let i = 1; i <= pdf.numPages; i++) {
//     let page = await pdf.getPage(i);
//     let content = await page.getTextContent();
//     pages.push(content.items.map(item => item.str));
//   }
//   return pages;
// }

// const BATCH_SIZE = 1000;  // Choose an appropriate batch size based on the API's constraints.

// async function textToEmbedding(texts) {
//     let embeddings = [];

//     for (let i = 0; i < texts.length; i += BATCH_SIZE) {
//         console.log("Processing batch " + i)
//         const batch = texts.slice(i, i + BATCH_SIZE);
//         const response = await openai.embeddings.create({
//             model: "text-embedding-ada-002",
//             input: batch,
//         });
//         embeddings = embeddings.concat(response.data.map(record => record['embedding']));
//     }

//     return embeddings;
// }

// async function upsertEmbeddings(indexName, embeddings, chunks, namespace) {
//     const pinecone = new PineconeClient();
//     await pinecone.init({      
//         environment: "gcp-starter",      
//         apiKey: process.env.PINECONE_API_KEY,      
//     });
//     const indexer = pinecone.Index(indexName);
//     const vectors = embeddings.map((embedding, i) => ({
//       id: chunks[i].id,
//       values: Array.from(embedding),
//       metadata: chunks[i],
//     }));
//     const upsertRequest = {
//         vectors: vectors,
//         namespace: namespace,
//       };
//     const upsertResponse = await indexer.upsert({ upsertRequest });
//     return upsertResponse
// }

// async function getTitle(text, namespace, titles=[], index=-1){
//     if (titles.length > 0) {
//         return titles[index]
//     }
//     let retries = 3
//     while (retries > 0) {
//         retries--
//         let completion = null
//         try{
//             completion = await openai.chat.completions.create({
//                 model: "gpt-3.5-turbo-0613",
//                 messages: [{role: "system", content: `You are an assistant that finds titles for text given by the user. User will give some text and you should return a 3-5 word title for it. You should ALWAYS return a title. If you're unable to create a title pick 5 words from the text or describe what it is. Do not use the word title in your response. The text is about the location - ${namespace}`}, {role: "user", content: text}],
//                 functions: [
//                     {
//                         name: "useTitleForText",
//                         description: "Use title for text summary",
//                         parameters: {
//                             type: "object",
//                             properties: {
//                                 title: {
//                                     type: "string",
//                                     description:"Title created for the text given"
//                                 },
//                             },
//                             required: ["title"],
//                         },
//                     }
//                 ],
//                 function_call: {"name": "useTitleForText"},
//             });
//         } catch (err) {
//             console.log("Error", err.response)
//             continue
//         }
//         if (completion?.status != 200) {
//             console.log("Error", completion)
//             continue
//         }
//         console.log("success", JSON.parse(completion.data.choices[0].message.function_call.arguments).title)
//         return JSON.parse(completion.data.choices[0].message.function_call.arguments).title;
//     }
//     return "No Title"
// }

// async function savePdfChunkToS3(filePath, startPage, endPage, uniqueId) {
//     const pdfBytes = fs.readFileSync(filePath);
//     const pdfDoc = await PDFDocument.load(pdfBytes);
//     const pages = pdfDoc.getPages();
//     const subset = await PDFDocument.create();
    
//     for(let i = startPage; i <= endPage && i < pages.length; i++) {
//         const [copiedPage] = await subset.copyPages(pdfDoc, [i]);
//         subset.addPage(copiedPage);
//     }
    
//     const subsetBytes = await subset.save();
    
//     const uploadKey = `${filePath.split('/').pop()}-${uniqueId}.pdf`;

//     const bucketName = 'vet-assist';
//     const result = await s3.upload({
//         Bucket: bucketName,
//         Key: uploadKey,
//         Body: subsetBytes
//     }).promise();

//     return {bucketName: bucketName, uploadKey: uploadKey};
// }
  
// async function extractChunksFromPdf(sourceUrl, filePath, chunkSize, namespace, titles=[]) {
//     let pages = await extractTextFromPdf(filePath);
//     let chunks = [];
//     for (let pageNumber = 0; pageNumber < pages.length; pageNumber++) {
//         console.log("Page Number " + pageNumber)
//         let items = pages[pageNumber];
//         let chunkText = "";
//         let chunkStartIndex = 0;
//         let chunkIndex = 0
//         const startPage = Math.max(pageNumber - 5, 0);
//         const endPage = Math.min(pageNumber + 5, pages.length - 1);
//         for (let i=0; i < items.length; i++) {
//             let id = uuidv4()
//             if (chunkText.length + items[i].length > chunkSize) {
//                 let { bucketName, uploadKey } = await savePdfChunkToS3(filePath, startPage, endPage, id)
//                 let chunkInfo = {
//                 id: id,
//                 pageNumber: pageNumber - startPage + 1,
//                 startIndex: chunkStartIndex,
//                 endIndex: i - 1,
//                 chunkText: chunkText,
//                 documentName: filePath.split('/').pop(),
//                 title: "",
//                 bucketName: bucketName,
//                 uploadKey: uploadKey,
//                 sourceCurrentPageNumber: pageNumber,
//                 sourceTotalPageNumber: pages.length,
//                 sourcePdfUrl: sourceUrl
//                 }; 
//                 chunks.push(chunkInfo)
//                 chunkIndex++
//                 chunkText = items[i];
//                 chunkStartIndex = i;
//             } else {
//                 chunkText += items[i];
//             }
//         }
//         if (chunkText.length > 0) {
//             let id = uuidv4()
//             let { bucketName, uploadKey } = await savePdfChunkToS3(filePath, startPage, endPage, id)
//             let chunkInfo = {
//                 id: id,
//                 pageNumber: pageNumber - startPage + 1,
//                 startIndex: chunkStartIndex,
//                 endIndex: items.length - 1,
//                 chunkText: chunkText,
//                 documentName: filePath.split('/').pop(),
//                 title: "",
//                 bucketName: bucketName,
//                 uploadKey: uploadKey,
//                 sourceCurrentPageNumber: pageNumber,
//                 sourceTotalPageNumber: pages.length,
//                 sourcePdfUrl: sourceUrl
//             };
//             chunks.push(chunkInfo);
//             chunkIndex++
//         }
//     }
//     const chunkTexts = chunks.map(chunk => chunk.chunkText);
//     const embeddings = await textToEmbedding(chunkTexts);

//     // Upsert in batches
//     try{
//         await batchUpsert(embeddings, chunks, namespace, 100);
//     } catch (err) {
//         console.log("Error", err)
//         return err
//     }
//     return "Success"
// }

// async function batchUpsert(embeddings, chunks, namespace, batchSize=100) {
//     for(let i = 0; i < embeddings.length; i += batchSize) {
//       console.log("Upserting batch", i, i + batchSize)
//       const batchEmbeddings = embeddings.slice(i, i + batchSize);
//       const batchChunks = chunks.slice(i, i + batchSize);
//       response = await upsertEmbeddings('vet-assist', batchEmbeddings, batchChunks, namespace);
//       console.log("Response", response)
//     }
// }

// function addNoteToVisitDescriptions(inputObj) {
//     const disclaimer = " THESE NOTES SHOULD BE ONLY BASED ON THE PROVIDED TRANSCRIPT. DO NOT USE ANY OUTSIDE KNOWLEDGE.";

//     // Check if 'visit' and 'properties' keys exist
//     if (inputObj.parameters && inputObj.parameters.properties && inputObj.parameters.properties.visit && inputObj.parameters.properties.visit.properties) {
//         const visitProperties = inputObj.parameters.properties.visit.properties;

//         // Iterate only through the properties of 'visit'
//         for (const key in visitProperties) {
//             if (visitProperties[key].hasOwnProperty('description')) {
//                 // Append the disclaimer to the description
//                 visitProperties[key].description += disclaimer;
//             }
//         }
//     }

//     return inputObj;
// }

// module.exports = {downloadAndProcessPDF, getSignedUrl, extractSummaryFromPdf, getSignedUrl, transcribeAudio, extractSummaryFromAudioTranscript, summaryListToBullet, answerQuestionsAboutRecords};