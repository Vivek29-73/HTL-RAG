// src/api/index.js
// all backend API calls in one place
// makes it easy to change base URL later

const BASE_URL = "http://localhost:5000/api"

export async function registerUser(name, email, password) {
    const res = await fetch(`${BASE_URL}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name, email, password })
    })
    return res.json()
}

export async function loginUser(email, password) {
    const res = await fetch(`${BASE_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password })
    })
    return res.json()
}

export async function logoutUser() {
    const res = await fetch(`${BASE_URL}/auth/logout`, {
        method: "POST",
        credentials: "include"
    })
    return res.json()
}

export async function getMe() {
    const res = await fetch(`${BASE_URL}/auth/me`, {
        credentials: "include"
    })
    return res.json()
}

export async function uploadDocuments(files) {
    const formData = new FormData()
    for(const file of files) {
        formData.append("documents", file)
    }
    const res = await fetch(`${BASE_URL}/documents/upload`, {
        method: "POST",
        credentials: "include",
        body: formData
    })
    return res.json()
}

export async function getDocuments() {
    const res = await fetch(`${BASE_URL}/documents/my-documents`, {
        credentials: "include"
    })
    return res.json()
}

export async function deleteDocument(documentId) {
    const res = await fetch(`${BASE_URL}/documents/${documentId}`, {
        method: "DELETE",
        credentials: "include"
    })
    return res.json()
}

// NEW — searches documents by topic
// returns top 5 relevant documents
export async function searchDocuments(query) {
    const res = await fetch(`${BASE_URL}/documents/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ query })
    })
    return res.json()
}

// UPDATED — now accepts mode and documentIds
export async function askQuestion(question, mode = "simple", documentIds = []) {
    const res = await fetch(`${BASE_URL}/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ question, mode, documentIds })
        // mode tells backend which system to use
        // documentIds only needed for from-docs mode
    })
    return res.json()
}

export async function getHistory() {
    const res = await fetch(`${BASE_URL}/ask/history`, {
        credentials: "include"
    })
    return res.json()
}