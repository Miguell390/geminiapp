# PDF Whisperer Chatbot: Conversational AI for PDFs and Web Pages

PDF Whisperer Chatbot is a powerful web application designed to transform how users interact with their digital information. By leveraging the advanced capabilities of Google's Gemini Large Language Model, it offers an intuitive and efficient way to interact with data.

<img width="451" height="378" alt="pdfchatbot" src="https://github.com/user-attachments/assets/c36f70a2-b1c3-4337-8ff3-7a2b99101d55" />

---

## Table of Contents
- [Features](#features)
- [How It Works](#how-it-works)
- [Technology Stack](#technology-stack)
- [Project Setup](#project-setup)
  - [Prerequisites](#prerequisites)
  - [Backend Setup](#backend-setup)
  - [Frontend Setup](#frontend-setup)
- [API Endpoints](#api-endpoints)
- [Configuration](#configuration)
- [Future Enhancements](#future-enhancements)
- [Contributing](#contributing)
- [License](#license)

---

## Features
- **Multi-Source Ingestion**: Upload PDF documents from your local machine or submit a web URL to scrape its content.
- **Contextual Q&A**: Engage in a conversation with an AI that uses the content of your selected documents/URLs as its primary knowledge source.
- **Intelligent AI Powered by Gemini**: Utilizes Google's state-of-the-art Gemini model for high-quality natural language understanding and generation.
- **Multi-Document Interaction**: Select multiple processed sources (PDFs and web pages) to ask questions that require synthesizing information across them.
- **In-Session Context Modification**: Instruct the chatbot to "update" or "correct" its understanding of a specific document's text during your session.
- **Persistent Context**: Your uploaded/scraped documents are remembered across sessions, so you don't have to re-process them every time.
- **Clean & Intuitive UI**: A user-friendly interface built with React for managing your sources and interacting with the chatbot.

---

## How It Works
1. **Upload/Scrape**: The user provides a source—either a PDF file or a web URL—via the React frontend.
2. **Process**:
   - For PDFs: The file is saved, and its text content is extracted using `pdf-parse`.
   - For URLs: The backend fetches the page's HTML and uses Cheerio to parse and extract the main textual content.
3. **Store**: The extracted text and metadata for each source are stored in a simple JSON file (`database.json`) for persistence.
4. **Interact**: The user selects one or more processed sources as the context for the chat.
5. **Query**: When a user sends a message, the backend constructs a detailed prompt for the Gemini API, including the user's question and the full text from the selected contexts.
6. **Respond**: The Gemini API generates a response based on the provided context, which is then sent back to the user and displayed in the chat interface.

---

## Technology Stack
### Frontend
- **React**: A JavaScript library for building user interfaces.
- **Axios**: For making HTTP requests to the backend.
- **CSS3**: For styling the application.

### Backend
- **Node.js**: A JavaScript runtime environment.
- **Express.js**: A web application framework for Node.js, used for creating the API.
- **Google Generative AI SDK (@google/generative-ai)**: The official SDK for interacting with the Gemini API.
- **Multer**: Middleware for handling `multipart/form-data`, used for file uploads.
- **pdf-parse**: A library to extract text content from PDF files.
- **Axios & Cheerio**: For fetching and parsing HTML content from web URLs.
- **Dotenv**: For managing environment variables.
- **CORS**: For enabling Cross-Origin Resource Sharing.

---

## Project Setup
Follow these steps to set up and run the project locally.

### Prerequisites
- Node.js (v18.x or later recommended)
- npm or yarn package manager
- A Google Gemini API Key. You can get one from the [Google AI for Developers website](https://ai.google).

### Backend Setup
1. Navigate to the backend directory:
   ```bash
   cd backend
   ```
2. Install dependencies:
   ```bash
   npm install
   # or
   yarn install
   ```
3. Create an environment file:
   - Create a file named `.env` in the backend directory.
   - Add your API key:
     ```plaintext
     # .env
     GOOGLE_GEN_AI_KEY=YOUR_GEMINI_API_KEY_HERE
     PORT=8000
     ```
     > **Note**: The `GOOGLE_GEN_AI_KEY` is not provided in this repository for security reasons. You must obtain your own key.
4. Start the backend server:
   ```bash
   npm run dev
   # or to start without nodemon
   npm start
   ```
   The backend server should now be running on [http://localhost:8000](http://localhost:8000).

### Frontend Setup
1. Navigate to the frontend directory (from the root of the project):
   ```bash
   cd frontend
   ```
2. Install dependencies:
   ```bash
   npm install
   # or
   yarn install
   ```
3. Start the frontend development server:
   ```bash
   npm start
   ```
   The React application should open in your default browser, typically at [http://localhost:3000](http://localhost:3000).

---

## API Endpoints
The backend server exposes the following RESTful API endpoints:

- `POST /upload-pdf`: Uploads a PDF file. Expects `multipart/form-data` with a field named `pdfFile`.
- `POST /scrape-url`: Scrapes a web URL. Expects a JSON body: `{ "url": "https://example.com" }`.
- `POST /gemini`: Main endpoint for chat interaction. Expects a JSON body with the user's message and selected contexts.
- `POST /clear-context`: Clears a specific processed source. Expects a JSON body: `{ "fileName": "example.pdf" }` or `{ "fileName": "https://example.com" }`.

---

## Configuration
- **Backend Port**: The backend server port can be configured in the `.env` file via the `PORT` variable. Defaults to `8000`.
- **PDF Upload Limit**: The file size limit for PDF uploads is configured in `server.js` within the `multer` setup. Defaults to `10MB`.
- **Gemini Model**: The specific Gemini model used (e.g., `gemini-1.5-flash-latest`) is configured in `server.js`.

---

## Future Enhancements
This project has a strong foundation with many possibilities for future development:

- **Advanced RAG**: Implement text chunking and vector embeddings for more efficient handling of very large documents.
- **Robust Web Scraping**: Integrate a headless browser like Puppeteer to handle JavaScript-heavy, dynamic websites.
- **User Accounts**: Add user authentication for personalized document libraries and persistent chat histories.
- **UI/UX Improvements**: Add features like rich text display of contexts, better loading indicators, and conversation exporting.
- **Support for More File Types**: Extend functionality to include `.docx`, `.txt`, and other common document formats.

---

## Contributing
Contributions are welcome! If you have suggestions or want to improve the project, please feel free to fork the repository, make your changes, and open a pull request.

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## License
Created by Miguel LIM - 2025
