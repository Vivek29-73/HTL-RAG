import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import {
    getMe,
    logoutUser,
    uploadDocuments,
    getDocuments,
    deleteDocument,
    searchDocuments,
    askQuestion,
    getHistory
} from "../api"

// =============================================
// HISTORY ITEM COMPONENT
// =============================================
function HistoryItem({ item }) {
    const [open, setOpen] = useState(false)

    return (
        <div className="history-item">
            <div
                className="history-question"
                onClick={(e) => {
                    e.stopPropagation()
                    setOpen(!open)
                }}
            >
                <span>{item.question}</span>
                <span className="history-arrow">{open ? "▲" : "▼"}</span>
            </div>

            {open && (
                <div
                    className="history-answer"
                    onClick={(e) => e.stopPropagation()}
                >
                    <p>{item.answer}</p>
                    {item.sources && item.sources.length > 0 && (
                        <div className="sources">
                            {item.sources.map((source, i) => (
                                <p key={i} className="source-item">
                                    {source.filename} - score: {source.score.toFixed(2)}
                                </p>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}

// =============================================
// MAIN DASHBOARD COMPONENT
// =============================================
function Dashboard() {
    const [user, setUser] = useState(null)
    const [documents, setDocuments] = useState([])
    const [question, setQuestion] = useState("")
    const [answer, setAnswer] = useState("")
    const [sources, setSources] = useState([])
    const [history, setHistory] = useState([])
    const [loading, setLoading] = useState(false)
    const [uploadLoading, setUploadLoading] = useState(false)
    const [error, setError] = useState("")
    const [activeTab, setActiveTab] = useState("documents")

    // System 2 states
    const [searchQuery, setSearchQuery] = useState("")
    // what user types in search box
    const [searchResults, setSearchResults] = useState([])
    // top 5 documents returned by search
    const [selectedDocs, setSelectedDocs] = useState([])
    // which documents user selected
    const [searchLoading, setSearchLoading] = useState(false)

    // System 3 states
    const [mode, setMode] = useState("simple")
    // which mode user selected: simple, from-docs, smart
    const [conflictData, setConflictData] = useState(null)
    // stores conflict info when System 3 detects contradiction
    const [variance, setVariance] = useState(null)
    // shows user the variance score

    const navigate = useNavigate()

    useEffect(() => {
        checkAuth()
        loadDocuments()
        loadHistory()
    }, [])

    async function checkAuth() {
        const data = await getMe()
        if(!data.user) {
            navigate("/")
        } else {
            setUser(data.user)
        }
    }

    async function loadDocuments() {
        const data = await getDocuments()
        if(data.documents) {
            setDocuments(data.documents)
        }
    }

    async function loadHistory() {
        const data = await getHistory()
        if(data.history) {
            setHistory(data.history)
        }
    }

    async function handleUpload(e) {
        const files = e.target.files
        if(!files || files.length === 0) return
        setUploadLoading(true)
        setError("")
        const data = await uploadDocuments(files)
        if(data.success) {
            await loadDocuments()
        } else {
            setError(data.error || "upload failed")
        }
        setUploadLoading(false)
        e.target.value = ""
    }

    async function handleDelete(documentId) {
        const data = await deleteDocument(documentId)
        if(data.success) {
            await loadDocuments()
        }
    }

    // =============================================
    // SYSTEM 2 — DOCUMENT SEARCH
    // =============================================
    async function handleSearch() {
        if(!searchQuery.trim()) return
        setSearchLoading(true)
        setError("")
        setSearchResults([])
        setSelectedDocs([])

        const data = await searchDocuments(searchQuery)
        // calls POST /api/documents/search
        // returns top 5 relevant documents

        if(data.documents) {
            setSearchResults(data.documents)
            // shows user the ranked document list
        } else {
            setError(data.error || "search failed")
        }
        setSearchLoading(false)
    }

    function toggleDocSelection(documentId) {
        // when user clicks a document checkbox
        // add to selected if not there
        // remove if already selected
        setSelectedDocs(prev =>
            prev.includes(documentId)
                ? prev.filter(id => id !== documentId)
                // remove if already selected
                : [...prev, documentId]
                // add if not selected
        )
    }

    // =============================================
    // ASK QUESTION (all three modes)
    // =============================================
    async function handleAsk() {
        if(!question.trim()) return
        setLoading(true)
        setError("")
        setAnswer("")
        setSources([])
        setConflictData(null)
        setVariance(null)

        // for from-docs mode check documents selected
        if(mode === "from-docs" && selectedDocs.length === 0) {
            setError("please select at least one document first")
            setLoading(false)
            return
        }

        const data = await askQuestion(
            question,
            mode,
            // simple, from-docs, or smart
            mode === "from-docs" ? selectedDocs : []
            // only send documentIds for from-docs mode
        )

        if(data.confused) {
            // System 3 detected conflict
            setConflictData(data)
            // stores conflict info to show in UI
        } else if(data.answer) {
            setAnswer(data.answer)
            setSources(data.sources || [])
            if(data.variance) setVariance(data.variance)
            await loadHistory()
        } else {
            setError(data.error || "something went wrong")
        }

        setLoading(false)
    }

    // when user resolves conflict by choosing a document
    async function handleResolveConflict(chosenDocumentName) {
        // user clicked which document to trust
        // find the documentId for chosen document
        const chosenDoc = documents.find(
            doc => doc.filename === chosenDocumentName
        )

        if(!chosenDoc) return

        setLoading(true)
        setConflictData(null)

        // ask again but only from chosen document
        const data = await askQuestion(
            question,
            "from-docs",
            [chosenDoc._id]
            // only search in the document user chose
        )

        if(data.answer) {
            setAnswer(data.answer)
            setSources(data.sources || [])
            await loadHistory()
        } else {
            setError(data.error || "something went wrong")
        }

        setLoading(false)
    }

    async function handleLogout() {
        await logoutUser()
        navigate("/")
    }

    return (
        <div className="dashboard">

            {/* HEADER */}
            <div className="header">
                <h1>RAG Assistant</h1>
                <div className="header-right">
                    {user && <span>Hello, {user.name}</span>}
                    <button onClick={handleLogout} className="logout-btn">
                        Logout
                    </button>
                </div>
            </div>

            {/* TABS */}
            <div className="tabs">
                <button
                    className={activeTab === "documents" ? "tab active" : "tab"}
                    onClick={() => setActiveTab("documents")}
                >
                    Documents
                </button>
                <button
                    className={activeTab === "search" ? "tab active" : "tab"}
                    onClick={() => setActiveTab("search")}
                >
                    Search Docs
                </button>
                <button
                    className={activeTab === "ask" ? "tab active" : "tab"}
                    onClick={() => setActiveTab("ask")}
                >
                    Ask
                </button>
                <button
                    className={activeTab === "history" ? "tab active" : "tab"}
                    onClick={() => setActiveTab("history")}
                >
                    History
                </button>
            </div>

            {error && <p className="error">{error}</p>}

            {/* ===================================== */}
            {/* DOCUMENTS TAB */}
            {/* ===================================== */}
            {activeTab === "documents" && (
                <div className="tab-content">
                    <h3>Upload Documents</h3>
                    <input
                        type="file"
                        multiple
                        accept=".pdf"
                        onChange={handleUpload}
                        disabled={uploadLoading}
                    />
                    {uploadLoading && <p>uploading and processing...</p>}

                    <h3>Your Documents</h3>
                    {documents.length === 0 ? (
                        <p>no documents uploaded yet</p>
                    ) : (
                        documents.map(doc => (
                            <div key={doc._id} className="document-item">
                                <div>
                                    <p className="doc-name">{doc.filename}</p>
                                    <p className="doc-info">
                                        {doc.totalChunks} chunks
                                    </p>
                                </div>
                                <button
                                    onClick={() => handleDelete(doc._id)}
                                    className="delete-btn"
                                >
                                    Delete
                                </button>
                            </div>
                        ))
                    )}
                </div>
            )}

            {/* ===================================== */}
            {/* SEARCH DOCS TAB — System 2 */}
            {/* ===================================== */}
            {activeTab === "search" && (
                <div className="tab-content">
                    <h3>Search Documents</h3>
                    <p className="tab-desc">
                        search for relevant documents then ask AI from selected ones
                    </p>

                    {/* search input */}
                    <div className="search-row">
                        <input
                            type="text"
                            className="search-input"
                            placeholder="search topic eg: leave policy, salary..."
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            onKeyDown={e => e.key === "Enter" && handleSearch()}
                        />
                        <button
                            onClick={handleSearch}
                            disabled={searchLoading}
                            className="search-btn"
                        >
                            {searchLoading ? "searching..." : "Search"}
                        </button>
                    </div>

                    {/* search results */}
                    {searchResults.length > 0 && (
                        <div>
                            <h3>Top Relevant Documents</h3>
                            <p className="tab-desc">
                                select documents you want to ask AI about
                            </p>

                            {searchResults.map((doc, i) => (
                                <div
                                    key={doc.documentId}
                                    className={`search-result-item ${selectedDocs.includes(doc.documentId) ? "selected" : ""}`}
                                    onClick={() => toggleDocSelection(doc.documentId)}
                                >
                                    <div className="search-result-left">
                                        <span className="result-rank">#{i + 1}</span>
                                        <div>
                                            <p className="doc-name">{doc.filename}</p>
                                            <p className="doc-info">
                                                {doc.totalChunks} chunks · relevance: {(doc.score * 100).toFixed(0)}%
                                            </p>
                                        </div>
                                    </div>
                                    <div className={`result-checkbox ${selectedDocs.includes(doc.documentId) ? "checked" : ""}`}>
                                        {selectedDocs.includes(doc.documentId) ? "✓" : ""}
                                    </div>
                                </div>
                            ))}

                            {/* ask AI from selected docs */}
                            {selectedDocs.length > 0 && (
                                <div className="ask-from-docs">
                                    <p className="selected-count">
                                        {selectedDocs.length} document selected
                                    </p>
                                    <textarea
                                        placeholder="ask a question about selected documents..."
                                        value={question}
                                        onChange={e => setQuestion(e.target.value)}
                                        rows={3}
                                    />
                                    <button
                                        onClick={() => {
                                            setMode("from-docs")
                                            handleAsk()
                                        }}
                                        disabled={loading}
                                    >
                                        {loading ? "thinking..." : "Ask AI from Selected Docs"}
                                    </button>

                                    {answer && (
                                        <div className="answer-box">
                                            <h4>Answer</h4>
                                            <p>{answer}</p>
                                            {sources.length > 0 && (
                                                <div className="sources">
                                                    <h4>Sources</h4>
                                                    {sources.map((source, i) => (
                                                        <p key={i} className="source-item">
                                                            {source.filename} - score: {source.score.toFixed(2)}
                                                        </p>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* ===================================== */}
            {/* ASK TAB — System 1 and System 3 */}
            {/* ===================================== */}
            {activeTab === "ask" && (
                <div className="tab-content">
                    <h3>Ask a Question</h3>

                    {/* mode selector */}
                    <div className="mode-selector">
                        <button
                            className={mode === "simple" ? "mode-btn active" : "mode-btn"}
                            onClick={() => {
                                setMode("simple")
                                setAnswer("")
                                setConflictData(null)
                            }}
                        >
                            Simple Ask
                        </button>
                        <button
                            className={mode === "smart" ? "mode-btn active" : "mode-btn"}
                            onClick={() => {
                                setMode("smart")
                                setAnswer("")
                                setConflictData(null)
                            }}
                        >
                            Smart Ask
                        </button>
                    </div>

                    {/* mode description */}
                    <p className="mode-desc">
                        {mode === "simple"
                            ? "searches all your documents and answers directly"
                            : "detects conflicting information before answering"
                        }
                    </p>

                    <textarea
                        placeholder="ask anything about your documents..."
                        value={question}
                        onChange={e => setQuestion(e.target.value)}
                        rows={4}
                    />

                    <button onClick={handleAsk} disabled={loading}>
                        {loading ? "thinking..." : "Ask"}
                    </button>

                    {/* variance indicator for smart mode */}
                    {variance && (
                        <p className="variance-info">
                            chunk agreement score: {variance}
                            {parseFloat(variance) < 0.08
                                ? " (chunks agree)"
                                : " (chunks differ)"
                            }
                        </p>
                    )}

                    {/* normal answer */}
                    {answer && (
                        <div className="answer-box">
                            <h4>Answer</h4>
                            <p>{answer}</p>
                            {sources.length > 0 && (
                                <div className="sources">
                                    <h4>Sources</h4>
                                    {sources.map((source, i) => (
                                        <p key={i} className="source-item">
                                            {source.filename} - score: {source.score.toFixed(2)}
                                        </p>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* conflict UI for System 3 */}
                    {conflictData && (
                        <div className="conflict-box">
                            <h4>Conflicting Information Detected</h4>
                            <p className="conflict-message">
                                {conflictData.message}
                            </p>

                            <p className="conflict-subtitle">
                                Here is what each document says:
                            </p>

                            {conflictData.chunks.map((chunk, i) => (
                                <div key={i} className="conflict-chunk">
                                    <p className="conflict-source">
                                        {chunk.source}
                                    </p>
                                    <p className="conflict-preview">
                                        {chunk.preview}...
                                    </p>
                                    <button
                                        className="resolve-btn"
                                        onClick={() => handleResolveConflict(chunk.source)}
                                    >
                                        Use This Document
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* ===================================== */}
            {/* HISTORY TAB */}
            {/* ===================================== */}
            {activeTab === "history" && (
                <div className="tab-content">
                    <h3>Conversation History</h3>
                    {history.length === 0 ? (
                        <p>no history yet</p>
                    ) : (
                        <div className="history-list">
                            {history.map(item => (
                                <HistoryItem key={item._id} item={item} />
                            ))}
                        </div>
                    )}
                </div>
            )}

        </div>
    )
}

export default Dashboard