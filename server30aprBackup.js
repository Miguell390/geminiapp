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

// --- Gemini API Initialization ---
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GEN_AI_KEY);
// Choose a model that supports larger context windows if needed, e.g., gemini-1.5-flash
// Check Gemini documentation for latest model capabilities and context limits.
// gemini-pro might have limitations on context length. gemini-1.5-flash or pro often better.
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" }); // Updated model suggestion

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

// Endpoint for Chatting with Gemini (potentially using PDF context)
app.post('/gemini', async (req, res) => {
    try {
        const { history, message } = req.body;

        if (!message) {
            return res.status(400).send({ message: 'Message cannot be empty.' });
        }

        // --- Context Injection ---
        let prompt = message; // Start with the original user message

        if (pdfTextContext) {
            // Construct a prompt that explicitly tells the model to use the context
            prompt = `
Based *only* on the following text content extracted from the document '${pdfFileName || 'provided'}', please answer the user's question.
If the answer cannot be found in the text, state that clearly. Do not use any prior knowledge outside of this document context.

--- DOCUMENT CONTENT START ---
${pdfTextContext}
--- DOCUMENT CONTENT END ---

User Question: "${message}"

Answer:`;
            console.log(`Using PDF context from ${pdfFileName} for the prompt.`);
        } else {
            console.log("No PDF context loaded, using standard chat.");
            // Optional: You might want to prevent PDF-specific questions if no PDF is loaded
            // if (message.toLowerCase().includes("document") || message.toLowerCase().includes("pdf")) {
            //     return res.send("Please upload a PDF document first before asking questions about it.");
            // }
        }

        // Use the model directly with generateContent for potentially simpler context handling
        // startChat might be tricky if context changes between turns.
        // For RAG, often sending context + question in one go is easier.

        // Construct the history format suitable for generateContent if needed
        // Simplified: Just send the current prompt (with or without context)
        // For more complex history + RAG, you might need to curate the history sent to the API

        console.log("Sending to Gemini:", prompt.substring(0, 200) + "..."); // Log truncated prompt

        const result = await model.generateContent(prompt); // Send the potentially augmented prompt
        const response = await result.response;
        const text = response.text();

        console.log("Gemini Response:", text.substring(0, 200) + "..."); // Log truncated response
        res.send({ message: text }); // Send back as an object for consistency

    } catch (error) {
        console.error('Error communicating with Gemini:', error);
        // Attempt to parse potential Gemini API errors
        let errorMessage = 'An error occurred with the Gemini API.';
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