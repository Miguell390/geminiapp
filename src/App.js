import React, { useState, useCallback } from "react"; // Added useCallback
//import './App.css'; // Assuming you have some basic CSS
// import logo from 'public/pdfWhisperer.jpg';

const App = () => {
    // --- State Variables ---
    const [error, setError] = useState("");
    const [value, setValue] = useState(""); // User's current chat input
    const [chatHistory, setChatHistory] = useState([]);
    const [selectedFile, setSelectedFile] = useState(null); // Holds the selected PDF file object
    const [pdfFileName, setPdfFileName] = useState(null); // Name of the loaded PDF
    const [pdfFilesName, setPdfFilesName] = useState([]); // Name of the loaded PDF
    const [uploadStatus, setUploadStatus] = useState("idle"); // 'idle', 'uploading', 'success', 'error'
    const [isProcessing, setIsProcessing] = useState(false); // General loading state for API calls
    const [isPdfQuestion, setIsPdfQuestion] = useState(false); // Default to general question


    // --- Helper Functions ---
    const surpriseOptions = [
        'What is the most famous pokemon?',
        'What is the top pop song right now?',
        'Where did hamburger come from?'
    ];

    const surprise = () => {
        const randomValue = surpriseOptions[Math.floor(Math.random() * surpriseOptions.length)];
        setValue(randomValue);
        setError(""); // Clear error when surprising
    };

    // --- PDF Handling ---
    const handleFileChange = (event) => {
        const file = event.target.files[0];
        if (file && file.type === "application/pdf") {
            setSelectedFile(file);
            setError("");
            setUploadStatus("idle");
            console.log("File selected:", file.name);
        } else {
            setSelectedFile(null);
            setPdfFileName(null);
            setError("Please select a valid PDF file.");
            setUploadStatus("idle");
        }
        event.target.value = null;
    };

    const handleFileUpload = async () => {
        if (!selectedFile) {
            setError("No PDF file selected to upload.");
            return;
        }

        setError(""); // Clear previous errors
        setUploadStatus("uploading");
        setIsProcessing(true); // Set loading state

        const formData = new FormData();
        formData.append('pdfFile', selectedFile); // 'pdfFile' must match server's upload.single()

        console.log("Uploading file:", selectedFile.name);

        try {
            const response = await fetch('http://localhost:8000/upload-pdf', {
                method: 'POST',
                body: formData,
                // DO NOT set Content-Type header manually for FormData
                // The browser will set it correctly with the boundary
            });

            const data = await response.json(); // Expecting JSON response now

            if (!response.ok) {
                // Handle HTTP errors (e.g., 400, 500)
                throw new Error(data.message || `HTTP error! status: ${response.status}`);
            }

            console.log("Upload successful:", data);
            setUploadStatus("success");
            // setPdfFileName(data.fileName); // Store the filename from response
            setSelectedFile(null); // Clear selected file after successful upload
            // Optionally clear chat history or add a system message
            setPdfFilesName((files) => {
                const updatedFiles = [...files, { fileName: data.fileName, checked: true }];
                let name = pdfFilesName.filter(file => file.checked).map(file => file.fileName).join(", ");

                // Replace the last comma with " and"
                const lastCommaIndex = name.lastIndexOf(",");

                if (lastCommaIndex !== -1) {
                    name = name.substring(0, lastCommaIndex) + " and" + name.substring(lastCommaIndex + 1);
                }

                setPdfFileName(name);

                return updatedFiles;
            });

            setChatHistory(oldHistory => [...oldHistory, { role: "system", parts: [{ text: `PDF '${data.fileName}' uploaded. You can now ask questions about it.` }] }]);
        } catch (err) {
            console.error("Upload failed:", err);
            setError(`Upload failed: ${err.message}`);
            setUploadStatus("error");
            // setPdfFileName(null); // Clear filename on error
        } finally {
            setIsProcessing(false); // Reset loading state
        }
    };

    // --- Chat Handling ---
    const getResponse = async () => {
        if (!value) {
            setError("Error: Please ask a question.");
            return;
        }

        // --- Check if asking PDF question without PDF loaded ---
        if (isPdfQuestion && !pdfFilesName) {
            setError("Error: No PDF is loaded. Please upload a PDF or switch the toggle to ask a general question.");
            return;
        }

        setError(""); // Clear previous errors
        setIsProcessing(true); // Set loading state
        const currentMessage = value; // Capture value before clearing
        setValue(""); // Clear input immediately for better UX

        let selectedDocuments = pdfFilesName.filter(file => file.checked).map(file => file.fileName);

        try {
            const options = {
                method: 'POST',
                body: JSON.stringify({
                    history: chatHistory,
                    message: currentMessage, // Send the captured message<<<<<<< HEAD
                    // --- Send the toggle state ---
                    isPdfContextRequired: isPdfQuestion, // Send boolean flag
                    selectedChatDocument: selectedDocuments // Send the selected document name
                }),
                headers: {
                    'Content-Type': "application/json"
                }
            };
            let api = 'http://localhost:8000/gemini';

            const response = await fetch(api, options);
            const data = await response.json(); // Backend now sends { message: "..." }

            if (!response.ok) {
                // Handle specific errors from Gemini endpoint
                throw new Error(data.message || `Gemini API error! status: ${response.status}`);
            }

            console.log("Gemini response data:", data);

            setChatHistory(oldChatHistory => [...oldChatHistory, {
                role: "user",
                parts: [{ text: currentMessage }], // Use the captured message
            },
            {
                role: "model",
                // Access the message property from the JSON response
                parts: [{ text: data.message }],
            }
            ]);

        } catch (err) {
            console.error("Gemini request failed:", err);
            setError(`Something went wrong: ${err.message}`);
            // Optionally add the failed user message back to input or history
            // setValue(currentMessage); // Put message back in input?
            setChatHistory(oldChatHistory => [...oldChatHistory, {
                role: "user",
                parts: [{ text: currentMessage }],
            }, {
                role: "system",
                parts: [{ text: `Error getting response: ${err.message}` }]
            }
            ]);
        } finally {
            setIsProcessing(false); // Reset loading state
        }
    };

    const handleDocumentSelection = (fileName) => {
        setError(""); // Clear previous errors
        setIsProcessing(true); // Set loading state
        console.log("handleDocumentSelection", fileName);

        const updatedFiles = pdfFilesName.map(file => {
            if (file.fileName === fileName) {
                return { ...file, checked: !file.checked }; // Toggle the checked state
            }
            return file;
        });

        setPdfFilesName(updatedFiles);

        setIsProcessing(false); // Reset loading state
    };

    const handleClearContext = async (fileNameToRemove) => {
        setError("");
        setIsProcessing(true);
        console.log("Clearing PDF context...");
        try {
            const response = await fetch('http://localhost:8000/clear-context', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ fileName: fileNameToRemove }), // Send the filename to remove
            });
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || `HTTP error! status: ${response.status}`);
            }

            console.log("Clear context response:", data);
            setPdfFileName(null); // Clear the filename display
            setUploadStatus("idle");

            // remove file from list
            setPdfFilesName(files => files.filter(file => file.fileName !== fileNameToRemove));

            setChatHistory(oldHistory => [...oldHistory, { role: "system", parts: [{ text: `PDF ${fileNameToRemove} has been removed` }] }]);

        } catch (err) {
            console.error("Failed to clear context:", err);
            setError(`Failed to clear context: ${err.message}`);
        } finally {
            setIsProcessing(false);
        }
    };


    // Clear chat input, error, history, AND PDF context/selection
    const clearAll = () => {
        setValue("");
        setError("");
        setChatHistory([]);
        setPdfFilesName([]);
        setSelectedFile(null);
        setPdfFileName(null);
        setUploadStatus("idle");
        setIsProcessing(false); // Ensure loading state is reset
        // Optionally call handleClearContext if you want to ensure backend is cleared too
        // handleClearContext();
    };

    // --- Keyboard Shortcut ---
    const handleKeyDown = (event) => {
        if (event.key === 'Enter' && !event.shiftKey && value && !isProcessing) {
            event.preventDefault(); // Prevent default Enter behavior (like newline in textarea)
            getResponse();
        }
    };

    // --- Rendering ---
    return (
        <div className="app">
            <img src="./pdfWhisperer.jpg" alt="pdf whiseprer logo" className="logo" />


            {/* --- PDF Upload Section --- */}
            <div className="pdf-section">
                <label htmlFor="pdf-upload" className="pdf-upload-label">
                    {selectedFile ? `Selected: ${selectedFile.name}` : "Choose PDF Document"}
                </label>
                <input
                    id="pdf-upload"
                    type="file"
                    accept=".pdf"
                    onChange={handleFileChange}
                    disabled={isProcessing} // Disable while processing
                    style={{ display: 'none' }} // Hide default input, style the label
                />
                <button
                    onClick={handleFileUpload}
                    disabled={!selectedFile || uploadStatus === 'uploading' || isProcessing}
                    className="pdf-button"
                >
                    {uploadStatus === 'uploading' ? 'Uploading...' : 'Upload PDF'}
                </button>
                {
                    pdfFilesName.map((file, index) => (
                        <div className="pdf-status" key={index}>
                            <span>
                                <input
                                    type="checkbox"
                                    checked={file.checked}
                                    onChange={() => handleDocumentSelection(file.fileName)}
                                />
                                Loaded: {file.fileName}
                            </span>
                            <button
                                onClick={() => handleClearContext(file.fileName)}
                                disabled={isProcessing}
                                className="clear-context-button"
                            >
                                Remove document
                            </button>
                        </div>
                    ))
                }
                {
                    pdfFileName && (
                        <h1>{pdfFileName}</h1>
                    )
                }
                {uploadStatus === 'error' && !error && <p className="error-message">Upload failed. Please try again.</p>}
            </div>


            {/* --- Chat Section --- */}
            <div className="chat-section">
                <p className="info-text">
                    {pdfFileName
                        ? `Ask questions about ${pdfFileName} or general topics.`
                        : "Upload a PDF to ask questions about it, or ask general questions."}
                    <button
                        className="surprise"
                        onClick={surprise}
                        disabled={isProcessing} // Disable during processing
                    >
                        {!pdfFileName ? "Surprise Me (General)" : "Suggest Question"}
                    </button>
                </p>


                <div className="toggle-container">
                    {/* Use label for accessibility, associate with input via htmlFor/id */}
                    <label htmlFor="pdf-toggle" className={`switch-label ${pdfFilesName.length > 0 ? '' : 'disabled'}`}>
                        {/* Hidden actual checkbox that holds the state */}
                        <input
                            type="checkbox"
                            id="pdf-toggle"
                            checked={isPdfQuestion}
                            onChange={(e) => pdfFilesName.length > 0 && setIsPdfQuestion(e.target.checked)}
                        />
                        {/* This span will be styled as the switch track and knob */}
                        <span className="switch-slider"></span>
                        {/* Text describing the toggle's purpose */}
                        <span className="switch-text">
                            {pdfFileName
                                ? <>Use context from: <span className="switch-filename" title={pdfFileName}>{pdfFileName}</span></>
                                : 'Use PDF Context (Upload PDF first)'}
                        </span>
                    </label>
                    {/* Optional: Add a small helper text explaining the states */}
                    {pdfFileName && (
                        <span className="switch-helper-text">
                            (Toggle ON to ask about the PDF, OFF for general questions)
                        </span>
                    )}
                </div>

                <div className="input-container">
                    <input
                        value={value}
                        placeholder={pdfFileName ? `Ask about ${pdfFileName}...` : "Ask anything..."}
                        onChange={(e) => setValue(e.target.value)}
                        onKeyDown={handleKeyDown} // Add Enter key handler
                        disabled={isProcessing} // Disable during processing
                    />
                    {/* Use a single button, disable when processing */}
                    <button onClick={getResponse} disabled={!value || isProcessing}>
                        {isProcessing ? 'Thinking...' : 'Ask'}
                    </button>
                </div>

                {/* Consolidated Error Display */}
                {error && <p className="error-message">{error}</p>}

                <div className="search-result">
                    {/* Add a loading indicator for the response */}
                    {isProcessing && chatHistory.length > 0 && chatHistory[chatHistory.length - 1].role === 'user' && (
                        <div className="loading-indicator">
                            <p><strong>Model:</strong> Thinking...</p>
                        </div>
                    )}
                    {chatHistory.map((chatItem, index) => (
                        <div key={index} className={`chat-entry ${chatItem.role}`}>
                            <p>
                                <strong>{chatItem.role === 'model' ? 'AI' : chatItem.role === 'user' ? 'You' : 'System'}:</strong>{" "}
                                {/* Ensure parts is always an array and map through it */}
                                {Array.isArray(chatItem.parts) ? chatItem.parts.map((part, pIndex) => <span key={pIndex}>{part.text}</span>) : chatItem.parts.text /* Fallback if parts is not array */}
                            </p>
                        </div>
                    ))}
                </div>

                {/* Clear All Button */}
                {chatHistory.length > 0 && (
                    <button onClick={clearAll} className="clear-button" disabled={isProcessing}>
                        Clear Chat & PDF Context
                    </button>
                )}
            </div>
        </div>
    );
}

// --- Basic CSS (Add to App.css or a <style> tag) ---
/*
body { font-family: sans-serif; padding: 20px; background-color: #f4f4f4; }
.app { max-width: 800px; margin: 0 auto; background-color: #fff; padding: 20px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
h1 { text-align: center; color: #333; }

.pdf-section, .chat-section { margin-bottom: 25px; padding: 15px; border: 1px solid #ddd; border-radius: 5px; background-color: #fafafa;}
.pdf-upload-label { background-color: #007bff; color: white; padding: 10px 15px; border-radius: 4px; cursor: pointer; display: inline-block; margin-right: 10px; }
.pdf-upload-label:hover { background-color: #0056b3; }
.pdf-button, .clear-context-button, .clear-button, .surprise { padding: 10px 15px; border: none; border-radius: 4px; cursor: pointer; margin-left: 5px; }
.pdf-button { background-color: #28a745; color: white; }
.pdf-button:disabled { background-color: #aaa; }
.pdf-button:hover:not(:disabled) { background-color: #218838; }
.clear-context-button { background-color: #ffc107; color: #333; }
.clear-context-button:hover:not(:disabled) { background-color: #e0a800; }
.clear-button { background-color: #dc3545; color: white; display: block; margin: 15px auto 0;}
.clear-button:hover:not(:disabled) { background-color: #c82333; }
.surprise { background-color: #17a2b8; color: white; }
.surprise:hover:not(:disabled) { background-color: #138496; }
.pdf-status { margin-top: 10px; font-size: 0.9em; color: #555; background-color: #e9f5e9; padding: 8px; border-radius: 4px; display: flex; justify-content: space-between; align-items: center; }
.pdf-status span { font-weight: bold; }

.info-text { font-size: 0.9em; color: #666; margin-bottom: 15px; }
.input-container { display: flex; margin-bottom: 15px; }
.input-container input { flex-grow: 1; padding: 10px; border: 1px solid #ccc; border-radius: 4px 0 0 4px; }
.input-container button { padding: 10px 15px; border: none; background-color: #007bff; color: white; border-radius: 0 4px 4px 0; cursor: pointer; }
.input-container button:disabled { background-color: #aaa; }
.input-container button:hover:not(:disabled) { background-color: #0056b3; }

.error-message { color: #dc3545; font-weight: bold; margin-top: 10px; }
.search-result { max-height: 400px; overflow-y: auto; border: 1px solid #eee; padding: 10px; margin-top: 15px; border-radius: 4px; }
.chat-entry { margin-bottom: 10px; padding: 8px; border-radius: 4px; }
.chat-entry.user { background-color: #e7f3ff; text-align: right; }
.chat-entry.model { background-color: #f1f0f0; }
.chat-entry.system { background-color: #fffbe6; font-style: italic; color: #888; font-size: 0.9em; text-align: center; }
.chat-entry p { margin: 0; word-wrap: break-word; }
.chat-entry strong { color: #333; }
.loading-indicator { text-align: center; color: #888; padding: 10px;}

*/
export default App;
