const PORT = 8000;
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const pdf = require('pdf-parse');
const fs = require('fs');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const { GoogleGenerativeAI } = require('@google/generative-ai');

// --- Persistence Setup ---
const uploadsDir = 'uploads/'; // Directory where PDFs are stored
const uploadsDbFile = 'database.json'; // File storing metadata and text context

// Ensure uploads directory exists
if (!fs.existsSync(uploadsDir)){
    fs.mkdirSync(uploadsDir);
    console.log(`Created directory: ${uploadsDir}`);
}

// Load previous uploads metadata
let uploadedFiles = [];
if (fs.existsSync(uploadsDbFile)) {
    try {
        uploadedFiles = JSON.parse(fs.readFileSync(uploadsDbFile));
        console.log(`Loaded ${uploadedFiles.length} previous file records from ${uploadsDbFile}`);
    } catch (err) {
        console.error(`Error reading or parsing ${uploadsDbFile}. Starting fresh.`, err);
        uploadedFiles = [];
    }
}

// --- Multer Configuration (Disk Storage) ---
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadsDir); // Use the defined directory
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + '-' + file.originalname);
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'application/pdf') {
            cb(null, true);
        } else {
            cb(new Error('Only PDF files are allowed!'), false);
        }
    }
});

// --- Gemini API Initialization ---
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GEN_AI_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" });

// --- API Endpoints ---

// Endpoint to Upload and Process PDF
app.post('/upload-pdf', upload.single('pdfFile'), async (req, res) => {
    if (!req.file) {
        return res.status(400).send({ message: 'No PDF file uploaded.' });
    }
    try {
        console.log(`Processing PDF: ${req.file.originalname}`);
        const fileContent = fs.readFileSync(req.file.path);
        const data = await pdf(fileContent);

        const fileInfo = {
            path: req.file.path, // Path to the actual PDF file
            originalname: req.file.originalname,
            uploadTime: new Date(),
            pdfTextContext: data.text // Store extracted text here
        };

        // Add new file info and save
        uploadedFiles.push(fileInfo);
        fs.writeFileSync(uploadsDbFile, JSON.stringify(uploadedFiles, null, 2));

        console.log(`Successfully processed ${fileInfo.originalname}. Text length: ${fileInfo.pdfTextContext.length}`);
        res.send({
            message: `PDF '${fileInfo.originalname}' processed successfully. You can now ask questions about it.`,
            fileName: fileInfo.originalname
        });

    } catch (error) {
        console.error('Error processing PDF:', error);
        // Attempt to clean up the uploaded file if processing failed
        if (req.file && req.file.path && fs.existsSync(req.file.path)) {
            try { await fs.promises.unlink(req.file.path); } catch (cleanupErr) { console.error("Cleanup error:", cleanupErr); }
        }
        res.status(500).send({ message: 'Error processing PDF file.', error: error.message });
    }
});

// Endpoint to Clear PDF Context (Deletes file and removes record)
app.post('/clear-context', async (req, res) => {
    const fileNameToClear = req.body.fileName;
    console.log(`Attempting to clear context for: ${fileNameToClear}`);

    const fileIndex = uploadedFiles.findIndex(file => file.originalname === fileNameToClear);

    if (fileIndex === -1) {
        console.log(`File not found in records: ${fileNameToClear}`);
        return res.status(404).send({ message: `Context for '${fileNameToClear}' not found.` });
    }

    const fileToRemove = uploadedFiles[fileIndex];

    // Remove from array
    uploadedFiles.splice(fileIndex, 1);

    try {
        // Update the JSON database file
        fs.writeFileSync(uploadsDbFile, JSON.stringify(uploadedFiles, null, 2));
        console.log(`Removed record for ${fileNameToClear} from ${uploadsDbFile}`);

        // Delete the actual PDF file from disk
        if (fs.existsSync(fileToRemove.path)) {
            await fs.promises.unlink(fileToRemove.path);
            console.log(`Deleted file: ${fileToRemove.path}`);
        } else {
            console.log(`File path not found, couldn't delete: ${fileToRemove.path}`);
        }

        res.send({ message: `PDF context for '${fileNameToClear}' cleared successfully.` });

    } catch (err) {
        console.error(`Error during context clearing for ${fileNameToClear}:`, err);
        // If saving/deleting failed, maybe add the record back? Or leave as is.
        // uploadedFiles.splice(fileIndex, 0, fileToRemove); // Optional: Rollback array change on error
        res.status(500).send({ message: 'Error clearing PDF context.', error: err.message });
    }
});

// --- Modified Endpoint for Chatting with Gemini (Includes Update Logic) ---
app.post('/gemini', async (req, res) => {
    try {
        const { history, message, isPdfContextRequired, selectedChatDocument } = req.body;

        if (!message) {
            return res.status(400).send({ message: 'Message cannot be empty.' });
        }

        let responseText = ""; // Variable to hold the final text to send back

        // --- Check if PDF context is requested and available ---
        if (isPdfContextRequired && selectedChatDocument && selectedChatDocument.length > 0) {

            // --- Determine if it's an UPDATE request (requires EXACTLY ONE document) ---
            const isUpdateRequest = (
                selectedChatDocument.length === 1 && ( // MUST have only one document selected for update
                    message.toLowerCase().includes('update ') ||
                    message.toLowerCase().includes('change ') ||
                    message.toLowerCase().includes('modify ') ||
                    message.toLowerCase().includes('correct ') ||
                    message.toLowerCase().includes('replace ') ||
                    message.toLowerCase().includes('edit ')
                )
            );

            if (isUpdateRequest) {
                // === UPDATE CONTEXT LOGIC ===
                const targetDocumentName = selectedChatDocument[0];
                const targetFileIndex = uploadedFiles.findIndex(file => file.originalname === targetDocumentName);

                if (targetFileIndex === -1) {
                    console.error(`Attempted to update non-existent document record: ${targetDocumentName}`);
                    responseText = `Sorry, I couldn't find the document '${targetDocumentName}' to update. Please ensure it's uploaded and selected.`;
                } else {
                    const currentContext = uploadedFiles[targetFileIndex].pdfTextContext;
                    console.log(`Attempting context update for: "${targetDocumentName}" based on: "${message}"`);

                    const updatePrompt = `
You are an AI assistant performing an inline edit on the following document text based on the user's instruction.
Read the user's request and the current document text carefully.
Apply the requested change directly within the text. Ensure the output preserves the overall structure and flow as much as possible.
IMPORTANT: Respond with ONLY the complete, full text of the document *after* applying the change. Do not include any explanations, comments, apologies, greetings, or markdown formatting like \`\`\` around the text. Just output the raw, modified, full text content.

--- CURRENT DOCUMENT TEXT START (${targetDocumentName}) ---
${currentContext}
--- CURRENT DOCUMENT TEXT END (${targetDocumentName}) ---

--- USER'S UPDATE REQUEST ---
"${message}"

--- FULL MODIFIED DOCUMENT TEXT (Return only this) ---
`;
                    try {
                        const result = await model.generateContent(updatePrompt);
                        const response = await result.response;
                        const updatedText = response.text();

                        if (updatedText && updatedText.trim().length > 0 && updatedText.trim() !== currentContext.trim() /* Ensure change occurred */) {
                            // Update the context in the array
                            uploadedFiles[targetFileIndex].pdfTextContext = updatedText;

                            // Persist the change to database.json
                            fs.writeFileSync(uploadsDbFile, JSON.stringify(uploadedFiles, null, 2));

                            console.log(`Context updated successfully for ${targetDocumentName}. New length: ${updatedText.length}`);
                            responseText = `OK, I've updated the document context for '${targetDocumentName}' based on your request. This change is saved for this session and future server runs.`;
                        } else {
                            if (!updatedText || updatedText.trim().length === 0) {
                                console.warn("Gemini response for update was empty.");
                                responseText = "Sorry, I received an empty response while trying to update the context. Please try rephrasing your request.";
                            } else {
                                console.warn("Gemini response for update seemed identical to original text.");
                                responseText = "It seems the requested change didn't alter the text, or I couldn't apply it properly. The context remains unchanged.";
                            }
                        }
                    } catch (updateError) {
                        console.error(`Error during Gemini context update for ${targetDocumentName}:`, updateError);
                        responseText = `Sorry, I encountered an error while trying to update the context for '${targetDocumentName}'. Please try again later.`;
                    }
                } // End if targetFileIndex !== -1

            } else {
                // === STANDARD Q&A WITH CONTEXT LOGIC ===
                console.log(`Performing Q&A using context from: ${selectedChatDocument.join(', ')}`);
                let combinedContextPrompt = "";

                // Build prefix based on single/multiple docs
                if (selectedChatDocument.length === 1) {
                    combinedContextPrompt = `Based *only* on the following text content extracted from the document '${selectedChatDocument[0]}', please answer the user's question.`;
                } else {
                    combinedContextPrompt = `Based *only* on the following text content extracted from the documents '${selectedChatDocument.join(', ')}', please answer the user's question.`;
                }
                combinedContextPrompt += ` If the answer cannot be found in the text, state that clearly. Do not use any prior knowledge outside of this document context.\n\n`;

                // Append context from each selected document
                for (const docName of selectedChatDocument) {
                    const fileInfo = uploadedFiles.find(f => f.originalname === docName);
                    if (fileInfo) {
                        combinedContextPrompt += `--- DOCUMENT TITLE START ---\n${fileInfo.originalname}\n--- DOCUMENT TITLE END ---\n`;
                        combinedContextPrompt += `--- DOCUMENT CONTENT START ---\n${fileInfo.pdfTextContext}\n--- DOCUMENT CONTENT END ---\n\n`;
                    } else {
                        console.warn(`Context requested for non-existent document record: ${docName}`);
                        // Optionally add a note to the prompt about the missing context
                        // combinedContextPrompt += `[Note: Context for document '${docName}' was not found.]\n\n`;
                    }
                }

                combinedContextPrompt += `User Question: "${message}"\n\nAnswer:`;
                console.log("Sending Q&A to Gemini:", combinedContextPrompt.substring(0, 300) + "...");

                const result = await model.generateContent(combinedContextPrompt);
                const response = await result.response;
                responseText = response.text();
                console.log("Gemini Q&A Response:", responseText.substring(0, 200) + "...");

            } // End else (standard Q&A)

        } else {
            // --- GENERAL Q&A LOGIC (NO CONTEXT REQUESTED) ---
            const generalPrompt = message; // Just the user's message
            console.log("Processing as a general question (no PDF context).");
            console.log("Sending General Q to Gemini:", generalPrompt.substring(0, 300) + "...");

            const result = await model.generateContent(generalPrompt);
            const response = await result.response;
            responseText = response.text();
            console.log("Gemini General Response:", responseText.substring(0, 200) + "...");
        }

        // Send the final response (either confirmation or answer)
        res.send({ message: responseText });

    } catch (error) {
        console.error('Error in /gemini endpoint:', error);
        let errorMessage = 'An error occurred processing your request.';
        if (error.response && error.response.data && error.response.data.error) {
            errorMessage = `Gemini API Error: ${error.response.data.error.message}`;
        } else if (error.message) {
            errorMessage = error.message;
        }
        res.status(500).send({ message: errorMessage });
    }
});


// --- Error Handler for Multer ---
app.use((err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        console.error('Multer Error:', err);
        res.status(400).send({ message: `File Upload Error: ${err.message}` });
    } else if (err) {
        console.error('Unknown Upload Error:', err);
        res.status(400).send({ message: err.message || 'File upload failed.' });
    } else {
        next();
    }
});

app.listen(PORT, () => console.log(`Server listening on http://localhost:${PORT}`));