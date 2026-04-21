import React, { useState, useEffect, useRef } from 'react';
import { Send, Upload, Trash2, Shield, Loader2, FileText, Menu, X, Plus, BookOpen, MessageSquare, Settings, CheckCircle2, AlertCircle, Bot } from 'lucide-react';

interface Assistant {
  id: string;
  name: string;
  description: string;
  instructions: string;
}

interface ChatSession {
  id: string;
  title: string;
  assistant_id: string;
  updated_at: string;
}

interface Document {
  id: string;
  filename: string;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  citations?: string[];
}

export default function App() {
  const [assistants, setAssistants] = useState<Assistant[]>([]);
  const [selectedAssistant, setSelectedAssistant] = useState<Assistant | null>(null);
  
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [selectedSession, setSelectedSession] = useState<ChatSession | null>(null);
  
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Modals & Tabs
  const [activeTab, setActiveTab] = useState<'chat' | 'docs'>('chat');
  const [showAddModal, setShowAddModal] = useState(false);
  const [newAsstConfig, setNewAsstConfig] = useState({ name: '', description: '', instructions: 'You are a helpful AI assistant. Answer based only on the provided context.' });

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Initialization
  useEffect(() => {
    fetchAssistants();
  }, []);

  // Update when assistant selected
  useEffect(() => {
    if (selectedAssistant) {
      fetchSessions(selectedAssistant.id);
      fetchDocuments(selectedAssistant.id);
      setSelectedSession(null);
      setMessages([]);
      setActiveTab('chat');
    }
  }, [selectedAssistant]);

  // Update when session selected
  useEffect(() => {
    if (selectedSession) {
      fetchHistory(selectedSession.id);
    }
  }, [selectedSession]);

  const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  useEffect(() => scrollToBottom(), [messages]);

  // ---- API Calls ----
  
  const fetchAssistants = async () => {
    try {
      const res = await fetch('/api/assistants/');
      const data = await res.json();
      setAssistants(data);
      if (data.length > 0 && !selectedAssistant) setSelectedAssistant(data[0]);
    } catch (e) {
      console.error(e);
    }
  };

  const handleCreateAssistant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAsstConfig.name || !newAsstConfig.instructions) return;
    
    const formData = new FormData();
    formData.append('name', newAsstConfig.name);
    formData.append('description', newAsstConfig.description);
    formData.append('instructions', newAsstConfig.instructions);

    try {
      const res = await fetch('/api/assistants/', { method: 'POST', body: formData });
      if (res.ok) {
        setShowAddModal(false);
        setNewAsstConfig({ name: '', description: '', instructions: 'You are a helpful AI assistant. Answer based only on the provided context.' });
        fetchAssistants();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteAssistant = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await fetch(`/api/assistants/${id}`, { method: 'DELETE' });
      if (selectedAssistant?.id === id) setSelectedAssistant(null);
      fetchAssistants();
    } catch (e) {
      console.error(e);
    }
  };

  const fetchSessions = async (assistantId: string) => {
    try {
      const res = await fetch(`/api/assistants/${assistantId}/sessions/`);
      const data = await res.json();
      setSessions(data);
    } catch (e) {
      console.error(e);
    }
  };

  const handleCreateSession = async () => {
    if (!selectedAssistant) return;
    try {
      const res = await fetch(`/api/assistants/${selectedAssistant.id}/sessions/`, { method: 'POST' });
      const newSession = await res.json();
      fetchSessions(selectedAssistant.id);
      setSelectedSession(newSession);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchHistory = async (sessionId: string) => {
    try {
      const res = await fetch(`/api/sessions/${sessionId}/history/`);
      const data = await res.json();
      setMessages(data);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchDocuments = async (assistantId: string) => {
    try {
      const res = await fetch(`/api/assistants/${assistantId}/documents/`);
      const data = await res.json();
      setDocuments(data);
    } catch (e) {
      console.error(e);
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0 || !selectedAssistant) return;
    const files = Array.from(e.target.files);
    setUploading(true);

    for (const file of files) {
      const formData = new FormData();
      formData.append('file', file);
      try {
        await fetch(`/api/assistants/${selectedAssistant.id}/documents/`, { method: 'POST', body: formData });
      } catch (err) {
        console.error(`Failed to upload ${file.name}`);
      }
    }

    setUploading(false);
    fetchDocuments(selectedAssistant.id);
    if(fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDeleteDocument = async (docId: string) => {
    try {
      await fetch(`/api/documents/${docId}`, { method: 'DELETE' });
      if (selectedAssistant) fetchDocuments(selectedAssistant.id);
    } catch (e) {
      console.error(e);
    }
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading || !selectedSession) return;

    const userMessage = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setIsLoading(true);

    try {
      const response = await fetch(`/api/sessions/${selectedSession.id}/chat/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: userMessage })
      });

      if (!response.ok) throw new Error('API Error');
      const data = await response.json();
      setMessages(prev => [...prev, { role: 'assistant', content: data.reply, citations: data.citations }]);
      
      // Refresh sessions to get updated title
      if (selectedAssistant) fetchSessions(selectedAssistant.id);
    } catch (error) {
      setMessages(prev => [...prev, { role: 'assistant', content: "Sorry, I'm having trouble connecting." }]);
    } finally {
      setIsLoading(false);
    }
  };

  // ---- Renders ----

  return (
    <div className="flex h-screen w-full bg-gray-50 overflow-hidden font-sans text-gray-900">
      
      {/* Mobile Nav */}
      <div className="md:hidden absolute top-4 left-4 z-50">
        <button onClick={() => setSidebarOpen(true)} className="p-2 bg-white rounded-md shadow text-gray-600">
          <Menu size={20} />
        </button>
      </div>

      {sidebarOpen && <div className="fixed inset-0 bg-black/20 z-40 md:hidden" onClick={() => setSidebarOpen(false)} />}

      {/* Global Sidebar (Assistants) */}
      <aside className={`fixed md:static inset-y-0 left-0 bg-gray-900 text-gray-300 w-72 transform transition-transform duration-300 z-50 flex flex-col ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
        <div className="p-5 border-b border-gray-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="text-blue-500" size={24} />
            <h1 className="text-lg font-bold text-white tracking-wide">AI Enterprise</h1>
          </div>
          <button className="md:hidden text-gray-500" onClick={() => setSidebarOpen(false)}><X size={20} /></button>
        </div>

        <div className="p-4">
          <button 
            onClick={() => setShowAddModal(true)}
            className="w-full flex items-center justify-center gap-2 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors text-sm"
          >
            <Plus size={16} /> New Assistant
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-3 space-y-1">
          <div className="px-3 pt-2 pb-1 text-xs font-semibold text-gray-500 uppercase tracking-wider">Your Assistants</div>
          {assistants.length === 0 ? (
            <div className="px-3 py-4 text-sm text-gray-500 italic text-center">No assistants created yet.</div>
          ) : (
            assistants.map(a => (
              <div 
                key={a.id} 
                onClick={() => setSelectedAssistant(a)}
                className={`w-full text-left px-3 py-3 rounded-lg flex items-center justify-between cursor-pointer group transition-colors ${selectedAssistant?.id === a.id ? 'bg-gray-800 text-white' : 'hover:bg-gray-800/50 text-gray-400 hover:text-gray-200'}`}
              >
                <div className="flex items-center gap-3 overflow-hidden">
                  <Bot size={18} className={selectedAssistant?.id === a.id ? "text-blue-400" : "text-gray-500"} />
                  <div className="truncate">
                    <div className="text-sm font-medium truncate">{a.name}</div>
                  </div>
                </div>
                <button onClick={(e) => handleDeleteAssistant(a.id, e)} className="opacity-0 group-hover:opacity-100 p-1 text-gray-500 hover:text-red-400 hover:bg-gray-700 rounded transition-all">
                  <Trash2 size={14} />
                </button>
              </div>
            ))
          )}
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col h-full bg-white relative">
        {selectedAssistant ? (
          <>
            {/* Context Header */}
            <header className="border-b border-gray-200 bg-white px-6 py-4 flex items-center justify-between shadow-sm z-10 w-full">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                  <Bot size={24} />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-gray-800 leading-tight">{selectedAssistant.name}</h2>
                  <p className="text-xs text-gray-500">{selectedAssistant.description || "AI Assistant"}</p>
                </div>
              </div>
              
              <div className="flex bg-gray-100 p-1 rounded-lg">
                <button 
                  onClick={() => setActiveTab('chat')} 
                  className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all flex items-center gap-2 ${activeTab === 'chat' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  <MessageSquare size={16} /> Chat
                </button>
                <button 
                  onClick={() => setActiveTab('docs')} 
                  className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all flex items-center gap-2 ${activeTab === 'docs' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  <BookOpen size={16} /> Knowledge Base
                </button>
              </div>
            </header>

            {/* TAB ROUTING */}
            {activeTab === 'chat' ? (
              <div className="flex-1 flex overflow-hidden">
                {/* Left Drawer: Sessions */}
                <div className="w-64 border-r border-gray-100 bg-gray-50/50 flex flex-col hidden md:flex">
                  <div className="p-4">
                    <button 
                      onClick={handleCreateSession}
                      className="w-full flex items-center justify-center gap-2 py-2 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 rounded-lg font-medium transition-colors text-sm shadow-sm"
                    >
                      <Plus size={16} /> New Chat
                    </button>
                  </div>
                  <div className="flex-1 overflow-y-auto p-2 space-y-1">
                    {sessions.map(s => (
                      <button 
                        key={s.id}
                        onClick={() => setSelectedSession(s)}
                        className={`w-full text-left px-3 py-2.5 rounded-md text-sm truncate transition-colors ${selectedSession?.id === s.id ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-600 hover:bg-gray-100'}`}
                      >
                        {s.title || "New Conversation"}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Right Area: Chat Window */}
                <div className="flex-1 flex flex-col bg-white relative">
                  {!selectedSession ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-gray-400 p-8 text-center">
                      <MessageSquare size={48} className="mb-4 text-gray-300" />
                      <h3 className="text-lg font-medium text-gray-600 mb-2">No Active Chat</h3>
                      <p className="text-sm max-w-sm">Select a chat session from the menu or start a new conversation with {selectedAssistant.name}.</p>
                      <button onClick={handleCreateSession} className="mt-6 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 shadow-sm transition-colors">Start New Conversation</button>
                    </div>
                  ) : (
                    <>
                      <div className="flex-1 overflow-y-auto p-4 md:p-8 scroll-smooth w-full">
                        <div className="max-w-3xl mx-auto space-y-8 pb-32">
                          {messages.length === 0 && (
                            <div className="flex flex-col items-center text-center mt-20 text-gray-400">
                              <Bot size={40} className="mb-3 text-blue-100" />
                              <p>Start chatting with {selectedAssistant.name}! It only knows about its requested Knowledge Base.</p>
                            </div>
                          )}
                          
                          {messages.map((msg, index) => (
                            <div key={index} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                              <div className={`max-w-[85%] rounded-2xl px-5 py-4 ${
                                  msg.role === 'user' 
                                    ? 'bg-blue-600 text-white rounded-br-none shadow-sm' 
                                    : 'bg-gray-50 border border-gray-200 text-gray-800 rounded-bl-none shadow-sm'
                                }`}>
                                  <div className="whitespace-pre-wrap leading-relaxed text-[15px]">{msg.content}</div>
                                  
                                  {msg.citations && msg.citations.length > 0 && (
                                    <div className="mt-4 pt-3 border-t border-gray-200/60">
                                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-2">Grounded Sources</span>
                                      <div className="flex flex-wrap gap-1.5">
                                        {msg.citations.map((cite, i) => (
                                          <span key={i} className="inline-flex items-center px-2 py-1 rounded bg-white shadow-sm border border-gray-200 text-xs text-gray-500 font-medium">
                                            <FileText size={10} className="mr-1 text-blue-400" />
                                            {cite}
                                          </span>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                              </div>
                            </div>
                          ))}
                          
                          {isLoading && (
                            <div className="flex justify-start">
                              <div className="bg-gray-50 border border-gray-200 rounded-2xl rounded-bl-none px-5 py-4 shadow-sm flex items-center space-x-2 text-blue-500">
                                <Loader2 size={18} className="animate-spin" />
                                <span className="text-sm font-medium">Querying Vector Space...</span>
                              </div>
                            </div>
                          )}
                          <div ref={messagesEndRef} />
                        </div>
                      </div>

                      {/* Chat Input */}
                      <div className="absolute bottom-0 w-full bg-gradient-to-t from-white via-white to-transparent pt-10 pb-6 px-4 md:px-8">
                        <form onSubmit={handleSend} className="max-w-3xl mx-auto relative flex items-end overflow-hidden rounded-2xl bg-white shadow-[0_0_20px_rgba(0,0,0,0.08)] border border-gray-200 focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100 transition-all">
                          <textarea
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(e); } }}
                            placeholder={`Ask ${selectedAssistant.name} a question...`}
                            className="px-5 py-4 w-full bg-transparent border-0 focus:ring-0 resize-none max-h-48 outline-none text-gray-800 placeholder-gray-400 text-[15px]"
                            rows={input.split('\n').length > 1 ? Math.min(input.split('\n').length, 5) : 1}
                            style={{ minHeight: '56px' }}
                          />
                          <button type="submit" disabled={!input.trim() || isLoading} className="absolute right-2 bottom-2 p-2.5 rounded-xl bg-blue-600 text-white disabled:bg-gray-200 disabled:text-gray-400 hover:bg-blue-700 transition-colors shadow-sm">
                            <Send size={16} />
                          </button>
                        </form>
                        <div className="text-center mt-2">
                          <span className="text-[11px] text-gray-400 font-medium tracking-wide">Assistant contextualizes strictly off uploaded files.</span>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto bg-gray-50/50 p-6 md:p-12">
                <div className="max-w-4xl mx-auto space-y-8">
                  
                  <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 md:p-8">
                    <div className="flex items-center justify-between mb-6">
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900">Knowledge Base</h3>
                        <p className="text-sm text-gray-500 mt-1">Upload files specifically for {selectedAssistant.name}. It will not see files from other assistants.</p>
                      </div>
                      
                      <button 
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploading}
                        className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors shadow-sm disabled:opacity-70 disabled:cursor-not-allowed"
                      >
                        {uploading ? <Loader2 className="animate-spin" size={18} /> : <Upload size={18} />}
                        {uploading ? 'Processing...' : 'Upload Docs'}
                      </button>
                      <input type="file" multiple className="hidden" ref={fileInputRef} onChange={handleUpload} accept=".pdf,.docx,.pptx,.txt,.csv,.md,.png,.jpg,.jpeg" />
                    </div>

                    {documents.length === 0 ? (
                      <div className="text-center py-12 px-4 border-2 border-dashed border-gray-200 rounded-xl bg-gray-50">
                        <BookOpen className="mx-auto h-12 w-12 text-gray-300" />
                        <h4 className="mt-4 text-sm font-medium text-gray-900">No documents</h4>
                        <p className="mt-1 text-sm text-gray-500">Get started by uploading PDFs, Word, or Text files to train this assistant.</p>
                      </div>
                    ) : (
                      <div className="border border-gray-200 rounded-xl overflow-hidden">
                        <div className="bg-gray-50 px-4 py-3 border-b border-gray-200 flex text-xs font-semibold text-gray-500 uppercase">
                          <div className="flex-1">Filename</div>
                          <div className="w-16 text-right">Action</div>
                        </div>
                        <ul className="divide-y divide-gray-100 bg-white">
                          {documents.map(doc => (
                            <li key={doc.id} className="px-4 py-3 flex items-center justify-between hover:bg-gray-50/50 transition-colors">
                              <div className="flex items-center gap-3 overflow-hidden">
                                <FileText size={16} className="text-blue-500 shrink-0" />
                                <span className="text-sm font-medium text-gray-700 truncate">{doc.filename}</span>
                              </div>
                              <button onClick={() => handleDeleteDocument(doc.id)} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors">
                                <Trash2 size={16} />
                              </button>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>

                  <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 md:p-8">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                       <Settings size={20} className="text-gray-400" /> System Persona & Instructions
                    </h3>
                    <div className="bg-gray-50 p-4 rounded-xl text-sm text-gray-700 whitespace-pre-wrap border border-gray-100 font-mono leading-relaxed">
                      {selectedAssistant.instructions}
                    </div>
                  </div>

                </div>
              </div>
            )}
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center bg-gray-50 p-8 text-center">
            <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center mb-6">
              <Shield className="text-blue-600" size={32} />
            </div>
            <h2 className="text-2xl font-bold text-gray-800 mb-2">Welcome to Multi-Assistant Hub</h2>
            <p className="text-gray-500 max-w-md mx-auto mb-8">Create highly specialized AI models and isolate their knowledge bases. Select an assistant from the left or create a new one to begin.</p>
            <button onClick={() => setShowAddModal(true)} className="px-6 py-3 bg-blue-600 text-white rounded-xl font-medium shadow-md hover:bg-blue-700 transition-all flex items-center gap-2">
              <Plus size={20} /> Create Your First Assistant
            </button>
          </div>
        )}
      </main>

      {/* CREATE MODAL */}
      {showAddModal && (
        <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between bg-gray-50/50">
              <h2 className="text-lg font-semibold text-gray-900">Create New Assistant</h2>
              <button onClick={() => setShowAddModal(false)} className="text-gray-400 hover:text-gray-600 rounded-lg p-1 hover:bg-gray-100"><X size={20} /></button>
            </div>
            <form onSubmit={handleCreateAssistant} className="p-6 space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name <span className="text-red-500">*</span></label>
                <input required type="text" value={newAsstConfig.name} onChange={e => setNewAsstConfig({...newAsstConfig, name: e.target.value})} placeholder="e.g. Legal Contract Reviewer" className="w-full px-4 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <input type="text" value={newAsstConfig.description} onChange={e => setNewAsstConfig({...newAsstConfig, description: e.target.value})} placeholder="Briefly describe its purpose" className="w-full px-4 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">System Instructions <span className="text-red-500">*</span></label>
                <p className="text-[11px] text-gray-500 mb-2">Define how the AI should behave, its tone, and strict rules.</p>
                <textarea required value={newAsstConfig.instructions} onChange={e => setNewAsstConfig({...newAsstConfig, instructions: e.target.value})} rows={5} className="w-full px-4 py-3 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 font-mono text-sm leading-relaxed" />
              </div>
              <div className="pt-2 flex justify-end gap-3">
                <button type="button" onClick={() => setShowAddModal(false)} className="px-5 py-2.5 text-sm font-medium text-gray-600 hover:text-gray-900 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors">Cancel</button>
                <button type="submit" disabled={!newAsstConfig.name || !newAsstConfig.instructions} className="px-5 py-2.5 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm transition-all">Launch Assistant</button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}