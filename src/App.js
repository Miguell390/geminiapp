import { useState } from "react";

const App = () => {
    // state variables
    const [error, setError] = useState("");
    const [value, setValue] = useState(""); // user's current chat input
    const [urlValue, setUrlValue] = useState(""); // user's current url chat input
    const [chatHistory, setChatHistory] = useState([]); // chat history state
    const [selectedFile, setSelectedFile] = useState(null); // the selected PDF file object
    const [pdfFileName, setPdfFileName] = useState(null); // selected documents' name in a single state
    const [pdfFilesName, setPdfFilesName] = useState([]); // selected documents
    const [uploadStatus, setUploadStatus] = useState("idle"); // upload status state
    const [isProcessing, setIsProcessing] = useState(false); // is processing state
    const [isPdfQuestion, setIsPdfQuestion] = useState(false); // default to general question


    // surprise question options
    const surpriseOptions = [
        'What is the most famous pokemon?',
        'What is the top pop song right now?',
        'Where did hamburger come from?'
    ];

    const surprise = () => {
        const randomValue = surpriseOptions[Math.floor(Math.random() * surpriseOptions.length)];
        setValue(randomValue);
        setError("");
    };

    // handler when file selected
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

    // handler to upload the file to server
    const handleFileUpload = async () => {
        if (!selectedFile) {
            setError("No PDF file selected to upload.");
            return;
        }

        setError(""); // clear errors message
        setUploadStatus("uploading");
        setIsProcessing(true); // set the app to is processing

        // send file to server using FormData
        const formData = new FormData();
        formData.append('pdfFile', selectedFile);

        console.log("Uploading file:", selectedFile.name);

        try {
            // server upload pdf url
            const response = await fetch('http://localhost:8000/upload-pdf', {
                method: 'POST',
                body: formData
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || `HTTP error! status: ${response.status}`);
            }

            console.log("Upload successful:", data);
            setUploadStatus("success");
            setSelectedFile(null);
            setPdfFilesName((files) => {
                const updatedFiles = [...files, { fileName: data.fileName, checked: true }];
                let name = updatedFiles.filter(file => file.checked).map(file => file.fileName).join(", ");

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
        } finally {
            setIsProcessing(false);
        }
    };

    // handler for website url input
    const handleUrlInput = async () => {
        if (!urlValue) {
            setError("Error: Please ask a question.");
            return;
        }

        setError(""); // clear previous errors
        setIsProcessing(true); // set is processing state
        const currentUrlValue = urlValue; // store value before clear input field
        setUrlValue(""); // clear input field

        try {
            const options = {
                method: 'POST',
                body: JSON.stringify({
                    url: currentUrlValue
                }),
                headers: {
                    'Content-Type': "application/json"
                }
            };

            // server api to import website url 
            let api = 'http://localhost:8000/import-url';

            const response = await fetch(api, options);

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || `HTTP error! status: ${response.status}`);
            }

            console.log("Upload successful:", data);
            setUploadStatus("success");
            setSelectedFile(null);
            setPdfFilesName((files) => {
                const updatedFiles = [...files, { fileName: data.fileName, checked: true }];
                let name = updatedFiles.filter(file => file.checked).map(file => file.fileName).join(", ");

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
        } finally {
            setIsProcessing(false);
        }
    };


    // handler on submit message
    const getResponse = async () => {
        if (!value) {
            setError("Error: Please ask a question.");
            return;
        }

        // check if any file selected if isPdfQuestion
        if (isPdfQuestion && !pdfFilesName) {
            setError("Error: No PDF is loaded. Please upload a PDF or switch the toggle to ask a general question.");
            return;
        }

        setError(""); // clear previous errors
        setIsProcessing(true); // set is processing state
        const currentMessage = value; // capture value before clearing
        setValue(""); // clear input

        let selectedDocuments = pdfFilesName.filter(file => file.checked).map(file => file.fileName);

        try {
            const options = {
                method: 'POST',
                body: JSON.stringify({
                    history: chatHistory,
                    message: currentMessage,
                    isPdfContextRequired: isPdfQuestion,
                    selectedChatDocument: selectedDocuments
                }),
                headers: {
                    'Content-Type': "application/json"
                }
            };
            let api = 'http://localhost:8000/gemini';

            const response = await fetch(api, options);
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || `Gemini API error! status: ${response.status}`);
            }

            console.log("Gemini response data:", data);

            setChatHistory(oldChatHistory => [...oldChatHistory, {
                role: "user",
                parts: [{ text: currentMessage }],
            },
            {
                role: "model",
                parts: [{ text: data.message }],
            }
            ]);

        } catch (err) {
            console.error("Gemini request failed:", err);
            setError(`Something went wrong: ${err.message}`);
            setChatHistory(oldChatHistory => [...oldChatHistory, {
                role: "user",
                parts: [{ text: currentMessage }],
            }, {
                role: "system",
                parts: [{ text: `Error getting response: ${err.message}` }]
            }
            ]);
        } finally {
            setIsProcessing(false);
        }
    };

    // handler for document selection
    const handleDocumentSelection = (fileName) => {
        setError(""); // clear previous error message
        setIsProcessing(true); // set is processing state
        console.log("handleDocumentSelection", fileName);

        const updatedFiles = pdfFilesName.map(file => {
            if (file.fileName === fileName) {
                return { ...file, checked: !file.checked }; // toggle the checked state
            }
            return file;
        });

        setPdfFilesName(updatedFiles);

        setIsProcessing(false);
    };

    // handler for clear context
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
            setPdfFileName(null);
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


    // clear everything
    const clearAll = () => {
        setValue("");
        setUrlValue("");
        setError("");
        setChatHistory([]);
        setPdfFilesName([]);
        setSelectedFile(null);
        setPdfFileName(null);
        setUploadStatus("idle");
        setIsProcessing(false);
    };

    // handle keyboard shortcut enter
    const handleKeyDown = (event) => {
        if (event.key === 'Enter' && !event.shiftKey && value && !isProcessing) {
            event.preventDefault();
            getResponse();
        }
    };

    // rendering
    return (
        <div className="app">
            <img src="./pdfWhisperer.jpg" alt="pdf whiseprer logo" className="logo" />

            {/* website url input */}
            <div className="input-container">
                <input
                    value={urlValue}
                    placeholder="Import content from URL..."
                    onChange={(e) => setUrlValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                    disabled={isProcessing} // disable if is processing
                />

                <button onClick={handleUrlInput} disabled={!urlValue || isProcessing}>
                    {isProcessing ? 'Thinking...' : 'Import URL'}
                </button>
            </div>

            {/* file input */}
            <div className="pdf-section">
                <label htmlFor="pdf-upload" className="pdf-upload-label">
                    {selectedFile ? `Selected: ${selectedFile.name}` : "Choose PDF Document"}
                </label>
                <input
                    id="pdf-upload"
                    type="file"
                    accept=".pdf"
                    onChange={handleFileChange}
                    disabled={isProcessing} // disable if is processing
                    style={{ display: 'none' }}
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
                            <span style={{ maxWidth: '75%' }}>
                                <input
                                    type="checkbox"
                                    checked={file.checked}
                                    onChange={() => handleDocumentSelection(file.fileName)}
                                />
                                Loaded: {
                                    file.fileName.includes("http") ?
                                        <a href={file.fileName} target="blank">{file.fileName}</a> :
                                        file.fileName}
                            </span>
                            <button
                                onClick={() => handleClearContext(file.fileName)}
                                disabled={isProcessing}
                                className="clear-context-button"
                            >
                                Remove source
                            </button>
                        </div>
                    ))
                }

                {uploadStatus === 'error' && !error && <p className="error-message">Upload failed. Please try again.</p>}
            </div>


            {/* chat box */}
            <div className="chat-section">
                <p className="info-text">
                    {pdfFileName
                        ? `Ask questions about ${pdfFileName} or general topics.`
                        : "Upload a PDF to ask questions about it, or ask general questions."}
                    <button
                        className="surprise"
                        onClick={surprise}
                        disabled={isProcessing} // disable if is processing
                    >
                        {!pdfFileName ? "Surprise Me (General)" : "Suggest Question"}
                    </button>
                </p>


                <div className="toggle-container">
                    <label htmlFor="pdf-toggle" className={`switch-label ${pdfFilesName.length > 0 ? '' : 'disabled'}`}>
                        <input
                            type="checkbox"
                            id="pdf-toggle"
                            checked={isPdfQuestion}
                            onChange={(e) => pdfFilesName.length > 0 && setIsPdfQuestion(e.target.checked)}
                        />

                        <span className="switch-slider"></span>

                        <span className="switch-text">
                            {pdfFileName
                                ? <>Use context from: <span className="switch-filename" title={pdfFileName}>{pdfFileName}</span></>
                                : 'Use PDF Context (Upload PDF first)'}
                        </span>
                    </label>

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
                        onKeyDown={handleKeyDown}
                        disabled={isProcessing}
                    />

                    <button onClick={getResponse} disabled={!value || isProcessing}>
                        {isProcessing ? 'Thinking...' : 'Ask'}
                    </button>
                </div>

                {error && <p className="error-message">{error}</p>}

                <div className="search-result">
                    {isProcessing && chatHistory.length > 0 && chatHistory[chatHistory.length - 1].role === 'user' && (
                        <div className="loading-indicator">
                            <p><strong>Model:</strong> Thinking...</p>
                        </div>
                    )}
                    {chatHistory.map((chatItem, index) => (
                        <div key={index} className={`chat-entry ${chatItem.role}`}>
                            <p>
                                <strong>{chatItem.role === 'model' ? 'AI' : chatItem.role === 'user' ? 'You' : 'System'}:</strong>{" "}
                                {Array.isArray(chatItem.parts) ? chatItem.parts.map((part, pIndex) => <span key={pIndex}>{part.text}</span>) : chatItem.parts.text}
                            </p>
                        </div>
                    ))}
                </div>

                {chatHistory.length > 0 && (
                    <button onClick={clearAll} className="clear-button" disabled={isProcessing}>
                        Clear Chat & PDF Context
                    </button>
                )}
            </div>
        </div>
    );
}

export default App;
