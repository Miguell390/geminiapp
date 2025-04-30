const PORT = 8000;
const express = require('express');
const cors = require('cors');
const multer = require('multer'); // For handling file uploads
const pdf = require('pdf-parse'); // For parsing PDF files
const fs = require('fs'); // File system module (might be needed depending on storage)

require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const { GoogleGenerativeAI } = require('@google/generative-ai');

// --- PDF Context Storage (Simple In-Memory) ---
// WARNING: This stores only ONE PDF context globally for the entire server.
// This is okay for a simple demo or single-user scenario.
// For multi-user applications, you'll need a more sophisticated approach
// (e.g., using session IDs, user IDs to map context).
let pdfTextContext = null;
let pdfFileName = null; // Optional: Store the filename

// --- Multer Configuration for File Uploads ---
// We'll use memory storage for simplicity. For large PDFs, consider disk storage.
const storage = multer.memoryStorage();
const upload = multer({
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // Example: Limit PDF size to 10MB
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'application/pdf') {
            cb(null, true); // Accept PDF files
        } else {
            cb(new Error('Only PDF files are allowed!'), false); // Reject other files
        }
    }
});


// --- API Endpoints ---

// Endpoint to Upload and Process PDF
app.post('/upload-pdf', upload.single('pdfFile'), async (req, res) => {
    if (!req.file) {
        return res.status(400).send({ message: 'No PDF file uploaded.' });
    }

    try {
        console.log(`Processing PDF: ${req.file.originalname}`);
        // pdf-parse works with the buffer directly from memoryStorage
        const data = await pdf(req.file.buffer);

        // Store the extracted text globally (replace with better storage if needed)
        pdfTextContext = data.text;
        pdfFileName = req.file.originalname; // Store the name

        console.log(`Successfully processed ${pdfFileName}. Text length: ${pdfTextContext.length}`);
        res.send({
            message: `PDF '${pdfFileName}' processed successfully. You can now ask questions about it.`,
            fileName: pdfFileName
        });

    } catch (error) {
        console.error('Error processing PDF:', error);
        // Clear context on error
        pdfTextContext = null;
        pdfFileName = null;
        res.status(500).send({ message: 'Error processing PDF file.', error: error.message });
    }
});

// Endpoint to Clear PDF Context
app.post('/clear-context', (req, res) => {
    console.log('Clearing PDF context.');
    pdfTextContext = null;
    pdfFileName = null;
    res.send({ message: 'PDF context cleared.' });
});


// --- START OF FILE server.js --- // (Make sure other parts are as per previous step)

// ... (other requires, app setup, PDF storage, multer, Gemini init remain the same) ...
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GEN_AI_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" }); // Use this initialized model


// ... (upload-pdf and clear-context endpoints remain the same) ...


// --- CORRECTED Endpoint for Chatting with Gemini ---
app.post('/gemini', async (req, res) => {
    // REMOVE THE CONFLICTING BLOCK THAT WAS HERE

    // --- Start directly with the intended logic ---
    try {
        // Get data from request body
        const { history, message, isPdfContextRequired } = req.body; // Get the toggle flag

        if (!message) {
            return res.status(400).send({ message: 'Message cannot be empty.' });
        }

        let prompt = ""; // Initialize prompt string
        let usingContext = false; // Flag (optional for logging)

        // Conditional Logic based on the toggle
        if (isPdfContextRequired) {
            console.log("Attempting to use PDF context...");
            if (pdfTextContext) {
                // Construct the prompt WITH PDF context
                prompt = `
                    Based *only* on the following text content extracted from the document '${pdfFileName || 'provided'}', please answer the user's question.
                    If the answer cannot be found in the text, state that clearly ("Based on the provided document text, I cannot answer this question.").
                    Do not use any prior knowledge outside of this document context. Do not mention the document structure unless asked.

                    --- DOCUMENT CONTENT START ---
                    ${pdfTextContext}
                    --- DOCUMENT CONTENT END ---

                    User Question: "${message}"

                    Answer:`;
                console.log(`Using PDF context from ${pdfFileName} for the prompt.`);
                usingContext = true;
            } else {
                // User wants PDF context, but it's not loaded
                console.warn("User requested PDF context, but none is loaded.");
                return res.status(400).send({ message: `You asked a question about the PDF, but no PDF context is currently loaded. Please upload a PDF first or toggle off the 'Ask about PDF' option.` });
            }
        } else {
            // General question - use the message directly as the prompt
            prompt = message;
            // You could potentially add *curated* history here if needed for general chat context,
            // ensuring no "system" roles are included and formatting it correctly for generateContent.
            // For now, just sending the message is simplest.
            console.log("Processing as a general question (no PDF context).");
        }

        // Simplified call to Gemini using generateContent with the constructed prompt string
        console.log("Sending to Gemini:", prompt.substring(0, 300) + "..."); // Log truncated prompt

        // Use the globally initialized model
        const result = await model.generateContent(prompt); // Send ONLY the string prompt
        const response = await result.response;
        const text = response.text();

        console.log("Gemini Response:", text.substring(0, 200) + "...");
        res.send({ message: text }); // Send back as an object

    } catch (error) {
        console.error('Error communicating with Gemini:', error);
        let errorMessage = 'An error occurred with the Gemini API.';
        // Attempt to get more specific error message if available
        if (error.message) {
             errorMessage = error.message;
             // Check if it's the specific system role error to provide clearer feedback maybe
             if (error.message.includes("system role is not supported")) {
                 errorMessage = "An internal error occurred. The AI model doesn't support 'system' messages in the history."
                 // This shouldn't happen now, but good for debugging
             }
        }
        res.status(500).send({ message: errorMessage });
    }
});


// --- Error Handler for Multer ---
app.use((err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        // A Multer error occurred when uploading.
        console.error('Multer Error:', err);
        res.status(400).send({ message: `File Upload Error: ${err.message}` });
    } else if (err) {
        // An unknown error occurred (e.g., file type filter)
        console.error('Unknown Upload Error:', err);
        res.status(400).send({ message: err.message || 'File upload failed.' });
    } else {
        next();
    }
});


app.listen(PORT, () => console.log(`Server listening on http://localhost:${PORT}`));