import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Send, Upload, Trash2, Loader2, FileText, Menu, X, Plus, BookOpen, MessageSquare, Settings, AlertCircle, Bot, Edit2, ChevronLeft, Sun, Moon, PanelLeftClose, PanelLeftOpen, Library, ArrowRight, Zap, Sparkles, ImageIcon, ArrowDown } from 'lucide-react';

interface Assistant {
  id: string;
  name: string;
  description: string;
  instructions: string;
  image_url?: string;
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
  const [showEditModal, setShowEditModal] = useState(false);
  const [assistantToDelete, setAssistantToDelete] = useState<Assistant | null>(null);
  const [sessionToDelete, setSessionToDelete] = useState<ChatSession | null>(null);
  const [documentToDelete, setDocumentToDelete] = useState<Document | null>(null);
  const [newAsstConfig, setNewAsstConfig] = useState({ name: '', description: '', instructions: 'You are a helpful AI assistant. Answer based only on the provided context.' });
  const [editAsstConfig, setEditAsstConfig] = useState({ id: '', name: '', description: '', instructions: '', image_url: '' });
  const [isDragging, setIsDragging] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');
  const [showChatsPane, setShowChatsPane] = useState(true);
  const [newAsstImage, setNewAsstImage] = useState<File | null>(null);
  const [editAsstImage, setEditAsstImage] = useState<File | null>(null);
  const [removeEditImage, setRemoveEditImage] = useState(false);
  const [generatingAvatar, setGeneratingAvatar] = useState(false);
  const [showScrollButton, setShowScrollButton] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const newAvatarInputRef = useRef<HTMLInputElement>(null);
  const editAvatarInputRef = useRef<HTMLInputElement>(null);

  // Initialization
  useEffect(() => {
    fetchAssistants();
  }, []);

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

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

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    const isNearBottom = scrollHeight - scrollTop - clientHeight < 150;
    setShowScrollButton(!isNearBottom);
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // ---- API Calls ----

  const fetchAssistants = async () => {
    try {
      const res = await fetch('/api/assistants/');
      const data = await res.json();
      setAssistants(data);
      // Homepage: do not auto-select — let user land on the homepage
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
    if (newAsstImage) {
      formData.append('image', newAsstImage);
    }

    try {
      const res = await fetch('/api/assistants/', { method: 'POST', body: formData });
      if (res.ok) {
        setShowAddModal(false);
        setNewAsstConfig({ name: '', description: '', instructions: 'You are a helpful AI assistant. Answer based only on the provided context.' });
        setNewAsstImage(null);
        fetchAssistants();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleUpdateAssistant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editAsstConfig.name || !editAsstConfig.instructions) return;

    const formData = new FormData();
    formData.append('name', editAsstConfig.name);
    formData.append('description', editAsstConfig.description);
    formData.append('instructions', editAsstConfig.instructions);
    if (editAsstImage) {
      formData.append('image', editAsstImage);
    }
    if (removeEditImage) {
      formData.append('remove_image', 'true');
    }

    try {
      const res = await fetch(`/api/assistants/${editAsstConfig.id}`, { method: 'PUT', body: formData });
      if (res.ok) {
        setShowEditModal(false);
        setEditAsstImage(null);
        setRemoveEditImage(false);
        fetchAssistants();
        if (selectedAssistant && selectedAssistant.id === editAsstConfig.id) {
          const updated = await res.json();
          setSelectedAssistant(updated);
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleEditAssistantClick = (assistant: Assistant, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditAsstConfig({
      id: assistant.id,
      name: assistant.name,
      description: assistant.description || '',
      instructions: assistant.instructions,
      image_url: assistant.image_url || ''
    });
    setEditAsstImage(null);
    setRemoveEditImage(false);
    setShowEditModal(true);
  };

  const handleGenerateAvatar = async (assistantId: string) => {
    setGeneratingAvatar(true);
    try {
      const res = await fetch(`/api/assistants/${assistantId}/avatar/generate`, { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setEditAsstConfig(prev => ({ ...prev, image_url: data.image_url }));
        fetchAssistants();
        if (selectedAssistant?.id === assistantId) {
          setSelectedAssistant(prev => prev ? { ...prev, image_url: data.image_url } : prev);
        }
      } else {
        const err = await res.json();
        alert(err.detail || 'Failed to generate avatar');
      }
    } catch (e) {
      console.error(e);
      alert('Failed to generate avatar');
    } finally {
      setGeneratingAvatar(false);
    }
  };

  const handleDeleteAssistant = (assistant: Assistant, e: React.MouseEvent) => {
    e.stopPropagation();
    setAssistantToDelete(assistant);
  };

  const confirmDeleteAssistant = async () => {
    if (!assistantToDelete) return;
    try {
      await fetch(`/api/assistants/${assistantToDelete.id}`, { method: 'DELETE' });
      if (selectedAssistant?.id === assistantToDelete.id) setSelectedAssistant(null);
      fetchAssistants();
    } catch (e) {
      console.error(e);
    }
    setAssistantToDelete(null);
  };

  const handleDeleteSession = (session: ChatSession, e: React.MouseEvent) => {
    e.stopPropagation();
    setSessionToDelete(session);
  };

  const confirmDeleteSession = async () => {
    if (!sessionToDelete || !selectedAssistant) return;
    try {
      await fetch(`/api/sessions/${sessionToDelete.id}`, { method: 'DELETE' });
      if (selectedSession?.id === sessionToDelete.id) {
        setSelectedSession(null);
        setMessages([]);
      }
      fetchSessions(selectedAssistant.id);
    } catch (e) {
      console.error(e);
    }
    setSessionToDelete(null);
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
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
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
    await processFiles(files);
  };

  const processFiles = async (files: File[]) => {
    if (!selectedAssistant) return;
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
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const files = Array.from(e.dataTransfer.files);
      await processFiles(files);
    }
  };

  const handleDeleteDocument = (doc: Document) => {
    setDocumentToDelete(doc);
  };

  const confirmDeleteDocument = async () => {
    if (!documentToDelete) return;
    try {
      await fetch(`/api/documents/${documentToDelete.id}`, { method: 'DELETE' });
      if (selectedAssistant) fetchDocuments(selectedAssistant.id);
    } catch (e) {
      console.error(e);
    }
    setDocumentToDelete(null);
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
      setMessages(prev => [...prev, { role: 'assistant', content: "Sorry, I encountered an error. Please try again." }]);
    } finally {
      setIsLoading(false);
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    }
  };

  // ---- Renders ----

  return (
    <div className="flex h-screen w-full bg-slate-50 dark:bg-slate-950 overflow-hidden font-sans text-slate-900 dark:text-white">

      {/* Mobile Nav - only when assistant selected */}
      {selectedAssistant && (
        <div className="md:hidden absolute top-4 left-4 z-50">
          <button onClick={() => setSidebarOpen(true)} className="p-2 bg-white dark:bg-slate-900 rounded-md shadow text-slate-600 dark:text-slate-400">
            <Menu size={20} />
          </button>
        </div>
      )}

      {sidebarOpen && <div className="fixed inset-0 bg-black/20 z-40 md:hidden" onClick={() => setSidebarOpen(false)} />}

      {/* Global Sidebar (Assistants) - hidden on homepage */}
      {selectedAssistant && (
      <aside className={`fixed md:static inset-y-0 left-0 bg-slate-50 dark:bg-slate-950 border-r border-slate-200 dark:border-slate-800 text-slate-700 dark:text-gray-300 w-72 transform transition-transform duration-300 z-50 flex flex-col ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
        <div className="h-[76px] px-5 border-b border-slate-200 dark:border-gray-800 flex items-center justify-between shrink-0">
          <button onClick={() => { setSelectedAssistant(null); setSidebarOpen(false); }} className="flex items-center gap-2 hover:opacity-80 transition-opacity">
            <Library className="text-indigo-400" size={24} />
            <h1 className="text-lg font-bold text-slate-900 dark:text-white tracking-wide">Lincite</h1>
          </button>
          <button className="md:hidden text-slate-600 dark:text-slate-400" onClick={() => setSidebarOpen(false)}><X size={20} /></button>
        </div>

        <div className="p-4">
          <button
            onClick={() => setShowAddModal(true)}
            className="w-full flex items-center justify-center gap-2 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-medium transition-colors text-sm"
          >
            <Plus size={16} /> New Assistant
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-1">
          <div className="px-3 pt-2 pb-1 text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Your Assistants</div>
          {assistants.length === 0 ? (
            <div className="px-3 py-4 text-sm text-slate-600 dark:text-slate-400 italic text-center">No assistants created yet.</div>
          ) : (
            assistants.map(a => (
              <div
                key={a.id}
                onClick={() => setSelectedAssistant(a)}
                className={`w-full text-left px-3 py-3 rounded-lg flex items-center justify-between cursor-pointer group transition-colors ${selectedAssistant?.id === a.id ? 'bg-slate-200 dark:bg-slate-800 text-slate-900 dark:text-white' : 'hover:bg-slate-100 dark:hover:bg-slate-800/60 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'}`}
              >
                <div className="flex items-center gap-3 overflow-hidden">
                  {a.image_url ? (
                    <img src={a.image_url} alt={a.name} className="w-7 h-7 rounded-lg object-cover shrink-0" />
                  ) : (
                    <Bot size={18} className={selectedAssistant?.id === a.id ? "text-indigo-600 dark:text-indigo-400" : "text-slate-600 dark:text-slate-400 group-hover:text-indigo-500"} />
                  )}
                  <div className="truncate">
                    <div className="text-sm font-medium truncate">{a.name}</div>
                  </div>
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-all">
                  <button onClick={(e) => handleEditAssistantClick(a, e)} className="p-1 text-slate-600 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-300 dark:hover:bg-slate-700 rounded transition-all">
                    <Edit2 size={14} />
                  </button>
                  <button onClick={(e) => handleDeleteAssistant(a, e)} className="p-1 text-slate-600 dark:text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:text-red-400 dark:hover:bg-red-500/10 rounded transition-all">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
        
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 shrink-0">
          <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} className="w-full flex items-center justify-center gap-2 py-2 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg transition-colors text-sm font-medium">
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />} 
            {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
          </button>
        </div>
      </aside>
      )}

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col h-full bg-white dark:bg-slate-900 relative min-w-0">
        {selectedAssistant ? (
          <>
            {/* Context Header */}
            <header className="min-h-[76px] py-3 px-4 pl-14 md:px-6 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-wrap sm:flex-nowrap items-center justify-between shadow-sm z-10 w-full shrink-0 gap-3">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                {selectedAssistant.image_url ? (
                  <img src={selectedAssistant.image_url} alt={selectedAssistant.name} className="w-10 h-10 rounded-lg object-cover shrink-0" />
                ) : (
                  <div className="p-2 bg-indigo-900/30 text-indigo-400 rounded-lg shrink-0">
                    <Bot size={24} />
                  </div>
                )}
                <div className="min-w-0">
                  <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-200 leading-tight truncate">{selectedAssistant.name}</h2>
                  <p className="text-xs text-slate-600 dark:text-slate-400 truncate">{selectedAssistant.description || "AI Assistant"}</p>
                </div>
              </div>

              <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg shrink-0">
                <button
                  onClick={() => setActiveTab('chat')}
                  className={`px-3 md:px-4 py-1.5 rounded-md text-sm font-medium transition-all flex items-center gap-2 ${activeTab === 'chat' ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700'}`}
                >
                  <MessageSquare size={16} /> Chat
                </button>
                <button
                  onClick={() => setActiveTab('docs')}
                  className={`px-3 md:px-4 py-1.5 rounded-md text-sm font-medium transition-all flex items-center gap-2 ${activeTab === 'docs' ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700'}`}
                >
                  <BookOpen size={16} /> <span className="hidden sm:inline">Knowledge Base</span><span className="sm:hidden">Docs</span>
                </button>
              </div>
            </header>

            {/* TAB ROUTING */}
            {activeTab === 'chat' ? (
              <div className="flex-1 flex overflow-hidden min-w-0">
                {/* Left Drawer: Sessions */}
                <div className={`w-full md:w-64 border-r border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50 flex flex-col transition-all duration-300 ${selectedSession ? 'hidden md:flex' : 'flex'} ${!showChatsPane ? 'md:hidden' : ''}`}>
                  <div className="p-4">
                    <button
                      onClick={handleCreateSession}
                      className="w-full flex items-center justify-center gap-2 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-lg font-medium transition-colors text-sm shadow-sm"
                    >
                      <Plus size={16} /> New Chat
                    </button>
                  </div>
                  <div className="flex-1 overflow-y-auto p-2 space-y-1">
                    {sessions.map(s => (
                      <div
                        key={s.id}
                        onClick={() => setSelectedSession(s)}
                        className={`w-full group px-3 py-2.5 rounded-md cursor-pointer transition-colors ${selectedSession?.id === s.id ? 'bg-indigo-50 dark:bg-indigo-900/30 font-medium' : 'hover:bg-slate-200 dark:hover:bg-slate-800'}`}
                      >
                        <div className="flex items-center justify-between">
                          <span className={`truncate pr-2 text-sm ${selectedSession?.id === s.id ? 'text-indigo-700 dark:text-indigo-300 font-semibold' : 'text-slate-700 dark:text-slate-300 group-hover:text-slate-900 dark:group-hover:text-white'}`}>{s.title || "New Conversation"}</span>
                          <button
                            onClick={(e) => handleDeleteSession(s, e)}
                            className={`opacity-0 group-hover:opacity-100 p-1.5 text-slate-500 hover:text-red-500 hover:bg-red-50 dark:hover:text-red-400 dark:hover:bg-red-500/10 rounded transition-all ${selectedSession?.id === s.id ? 'text-indigo-500 dark:text-indigo-400 hover:text-red-500 hover:bg-red-50 dark:hover:text-red-400 dark:hover:bg-red-500/10' : ''}`}
                            title="Delete Session"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                        <div className={`text-[10px] mt-0.5 ${selectedSession?.id === s.id ? 'text-indigo-400/70' : 'text-slate-500'}`}>
                          {s.updated_at ? new Date(s.updated_at + 'Z').toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Just now'}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Right Area: Chat Window */}
                <div className={`flex-1 flex flex-col bg-white dark:bg-slate-900 relative min-w-0 ${!selectedSession ? 'hidden md:flex' : 'flex'}`}>
                  
                  {/* Desktop Sidebar Toggle */}
                  <div className="hidden md:flex absolute top-0 left-0 z-20">
                    <button onClick={() => setShowChatsPane(!showChatsPane)} className="p-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 border-t-0 border-l-0 rounded-br-md text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all shadow-sm" title="Toggle Sidebar">
                      {showChatsPane ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}
                    </button>
                  </div>
                  {!selectedSession ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-slate-500 p-8 text-center">
                      <MessageSquare size={48} className="mb-4 text-slate-700 dark:text-gray-300" />
                      <h3 className="text-lg font-medium text-slate-600 dark:text-slate-400 mb-2">No Active Chat</h3>
                      <p className="text-sm max-w-sm">Select a chat session from the menu or start a new conversation with {selectedAssistant.name}.</p>
                      <button onClick={handleCreateSession} className="mt-6 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-500 shadow-sm transition-colors">Start New Conversation</button>
                    </div>
                  ) : (
                    <>
                      {/* Mobile back button */}
                      <div className="md:hidden border-b border-slate-200 dark:border-slate-800 bg-white/90 bg-white/90 dark:bg-slate-900/90 backdrop-blur-sm flex items-center px-4 py-2 shrink-0 z-10 sticky top-0">
                        <button onClick={() => setSelectedSession(null)} className="flex items-center text-sm font-medium text-indigo-400 hover:text-indigo-300 py-1">
                          <ChevronLeft size={18} className="mr-1" /> Back to Chats
                        </button>
                      </div>

                      <div className="flex-1 overflow-y-auto p-4 md:p-8 scroll-smooth w-full relative" onScroll={handleScroll}>
                        <div className="max-w-3xl mx-auto space-y-8 pb-32">
                          {messages.length === 0 && (
                            <div className="flex flex-col items-center text-center mt-20 text-slate-500">
                              <Bot size={40} className="mb-3 text-indigo-200" />
                              <p>Start chatting with {selectedAssistant.name}! It only knows about its requested Knowledge Base.</p>
                            </div>
                          )}

                          {messages.map((msg, index) => {
                            let cleanContent = msg.content;
                            if (msg.citations) {
                              msg.citations.forEach(cite => {
                                const escapedCite = cite.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                                const regex = new RegExp(`\\[${escapedCite}\\]`, 'g');
                                cleanContent = cleanContent.replace(regex, '');
                              });
                            }
                            
                            return (
                            <div key={index} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                              <div className={`max-w-[95%] md:max-w-[85%] rounded-2xl px-4 md:px-5 py-3 md:py-4 min-w-0 overflow-x-auto ${msg.role === 'user'
                                ? 'bg-indigo-600 text-white rounded-br-none shadow-sm'
                                : 'bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 rounded-bl-none shadow-sm'
                                }`}>
                                {msg.role === 'user' ? (
                                  <div className="whitespace-pre-wrap leading-relaxed text-[15px] break-words">{cleanContent}</div>
                                ) : (
                                  <div className="text-[15px] leading-relaxed prose dark:prose-invert prose-slate max-w-none prose-p:leading-relaxed prose-pre:bg-slate-50 dark:prose-pre:bg-slate-900 prose-pre:border prose-pre:border-slate-200 dark:prose-pre:border-slate-800 prose-code:text-indigo-600 dark:prose-code:text-indigo-300 break-words prose-pre:max-w-full">
                                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                      {cleanContent}
                                    </ReactMarkdown>
                                  </div>
                                )}

                                {msg.citations && msg.citations.length > 0 && (
                                  <div className="mt-4 pt-3 border-t border-slate-200/60 border-slate-200/60 dark:border-slate-800/60">
                                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-2">Grounded Sources</span>
                                    <div className="flex flex-wrap gap-1.5">
                                      {msg.citations.map((cite, i) => (
                                        <span key={i} className="inline-flex items-center px-2 py-1 rounded bg-white dark:bg-slate-900 shadow-sm border border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-400 font-medium">
                                          <FileText size={10} className="mr-1 text-indigo-400" />
                                          {cite}
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          )})}

                          {isLoading && (
                            <div className="flex justify-start">
                              <div className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl rounded-bl-none px-5 py-4 shadow-sm flex items-center space-x-2 text-indigo-1000">
                                <Loader2 size={18} className="animate-spin" />
                                <span className="text-sm font-medium">Querying Vector Space...</span>
                              </div>
                            </div>
                          )}
                          <div ref={messagesEndRef} />
                        </div>
                      </div>

                      {/* Chat Input */}
                      <div className="absolute bottom-0 left-0 w-full bg-gradient-to-t from-white dark:from-slate-950 via-white/80 dark:via-slate-950/80 to-transparent pt-32 pb-4 md:pb-6 px-3 md:px-8 pointer-events-none">
                        
                        <div className="max-w-3xl mx-auto relative pointer-events-auto">
                          {showScrollButton && (
                            <div className="absolute -top-14 left-1/2 -translate-x-1/2 flex justify-center w-full z-20">
                              <button
                                onClick={scrollToBottom}
                                className="p-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-full shadow-lg transition-transform hover:scale-105 active:scale-95 flex items-center justify-center animate-in fade-in slide-in-from-bottom-2"
                              >
                                <ArrowDown size={20} />
                              </button>
                            </div>
                          )}
                          <form onSubmit={handleSend} className="relative flex items-end overflow-hidden rounded-2xl bg-white dark:bg-slate-900 shadow-[0_0_20px_rgba(0,0,0,0.08)] border border-slate-200 dark:border-slate-800 focus-within:border-indigo-400 dark:focus-within:border-indigo-500/50 focus-within:ring-2 focus-within:ring-indigo-100 dark:focus-within:ring-indigo-500/20 transition-all min-w-0">
                            <textarea
                              value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(e); } }}
                            placeholder={`Ask ${selectedAssistant.name}...`}
                            className="px-4 md:px-5 py-3 md:py-4 w-full bg-transparent border-0 focus:ring-0 resize-none max-h-48 outline-none text-slate-800 dark:text-slate-200 placeholder-slate-500 dark:placeholder-gray-400 text-[15px] min-w-0"
                            rows={input.split('\n').length > 1 ? Math.min(input.split('\n').length, 5) : 1}
                            style={{ minHeight: '56px' }}
                          />
                          <button type="submit" disabled={!input.trim() || isLoading} className="absolute right-2 bottom-2 p-2.5 rounded-xl bg-indigo-600 text-white disabled:bg-slate-200 dark:disabled:bg-slate-200 dark:disabled:bg-slate-700 disabled:text-slate-500 hover:bg-indigo-500 transition-colors shadow-sm">
                            <Send size={16} />
                          </button>
                        </form>
                        <div className="text-center mt-2">
                          <span className="text-[11px] text-slate-500 font-medium tracking-wide">Assistant contextualizes strictly off uploaded files.</span>
                        </div>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto bg-slate-50/50 dark:bg-slate-950/50 p-6 md:p-12">
                <div className="max-w-4xl mx-auto space-y-8">

                  <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-6 md:p-8">
                    <div className="flex items-center justify-between mb-6">
                      <div>
                        <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Knowledge Base</h3>
                        <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">Upload files specifically for {selectedAssistant.name}. It will not see files from other assistants.</p>
                      </div>

                      <input type="file" multiple className="hidden" ref={fileInputRef} onChange={handleUpload} accept=".pdf,.docx,.pptx,.txt,.csv,.md,.png,.jpg,.jpeg" />
                    </div>

                    {/* Dedicated Dropzone */}
                    <div
                      className={`mb-8 flex flex-col items-center justify-center p-10 border-2 border-dashed rounded-xl transition-colors cursor-pointer ${isDragging ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20' : 'border-slate-300 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-950/50 hover:border-indigo-500/50 hover:bg-indigo-50 dark:hover:bg-indigo-900/10'}`} onDragEnter={handleDragEnter} onDragOver={handleDragOver}
                      onDragLeave={handleDragLeave}
                      onDrop={handleDrop}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <div className="p-3 bg-slate-100 dark:bg-slate-800 rounded-full mb-4">
                        {uploading ? <Loader2 className="animate-spin text-indigo-400" size={24} /> : <Upload className="text-indigo-400" size={24} />}
                      </div>
                      <h4 className="text-base font-semibold text-slate-900 dark:text-white mb-1">
                        {uploading ? 'Processing files...' : 'Click to upload or drag & drop'}
                      </h4>
                      <p className="text-sm text-slate-600 dark:text-slate-400 text-center max-w-sm">
                        PDF, Word, TXT, CSV, MD, or Images (max 10MB each)
                      </p>
                    </div>

                    {documents.length === 0 ? (
                      <div className="text-center py-12 px-4 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50 dark:bg-slate-950">
                        <BookOpen className="mx-auto h-12 w-12 text-slate-700 dark:text-gray-300" />
                        <h4 className="mt-4 text-sm font-medium text-slate-900 dark:text-white">No documents</h4>
                        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Get started by uploading PDFs, Word, or Text files to train this assistant.</p>
                      </div>
                    ) : (
                      <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                        <div className="bg-slate-100 dark:bg-slate-950 px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase">
                          <div className="flex-1">Filename</div>
                          <div className="w-16 text-right">Action</div>
                        </div>
                        <ul className="divide-y divide-slate-200 dark:divide-slate-800/80 bg-white dark:bg-slate-900">
                          {documents.map(doc => (
                            <li key={doc.id} className="px-4 py-3 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                              <div className="flex items-center gap-3 overflow-hidden">
                                <FileText size={16} className="text-indigo-1000 shrink-0" />
                                <span className="text-sm font-medium text-slate-700 dark:text-slate-300 truncate">{doc.filename}</span>
                              </div>
                              <button onClick={() => handleDeleteDocument(doc)} className="p-1.5 text-slate-500 hover:text-red-500 hover:bg-red-500/10 rounded-md transition-colors">
                                <Trash2 size={16} />
                              </button>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>

                  <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-6 md:p-8">
                    <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                      <Settings size={20} className="text-slate-500" /> System Persona & Instructions
                    </h3>
                    <div className="bg-slate-50 dark:bg-slate-950 p-4 rounded-xl text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap border border-slate-200/50 dark:border-slate-800/50 font-mono leading-relaxed">
                      {selectedAssistant.instructions}
                    </div>
                  </div>

                </div>
              </div>
            )}
          </>
        ) : (
          <div className="flex-1 overflow-y-auto bg-slate-50 dark:bg-slate-950">
            {/* Homepage Top Bar */}
            <div className="h-[76px] px-5 md:px-8 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <Library className="text-indigo-400" size={24} />
                <h1 className="text-lg font-bold text-slate-900 dark:text-white tracking-wide">Lincite</h1>
              </div>
              <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} className="p-2 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors" title={theme === 'dark' ? 'Light Mode' : 'Dark Mode'}>
                {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
              </button>
            </div>

            {/* Homepage Content */}
            <div className="max-w-5xl mx-auto px-4 md:px-8 py-12 md:py-16">
              
              {/* Hero Section */}
              <div className="text-center mb-12 md:mb-16">
                <div className="w-16 h-16 bg-indigo-100 dark:bg-indigo-900/30 rounded-2xl border border-indigo-200 dark:border-indigo-500/20 shadow-[0_0_30px_rgba(99,102,241,0.1)] dark:shadow-[0_0_30px_rgba(99,102,241,0.15)] flex items-center justify-center mx-auto mb-6">
                  <Library className="text-indigo-600 dark:text-indigo-400" size={32} />
                </div>
                <h2 className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-white mb-3 tracking-tight">Welcome to Lincite</h2>
                <p className="text-slate-500 dark:text-slate-400 max-w-lg mx-auto text-base md:text-lg leading-relaxed">Build specialized AI assistants with isolated knowledge bases. Upload documents and chat with precision-tuned models.</p>
              </div>

              {/* Assistants Grid */}
              {assistants.length > 0 ? (
                <>
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Your Assistants</h3>
                    <button onClick={() => setShowAddModal(true)} className="flex items-center gap-1.5 text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 dark:hover:text-indigo-300 transition-colors">
                      <Plus size={16} /> New Assistant
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {assistants.map(a => (
                      <button
                        key={a.id}
                        onClick={() => setSelectedAssistant(a)}
                        className="group relative text-left bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 hover:border-indigo-300 dark:hover:border-indigo-500/40 hover:shadow-lg hover:shadow-indigo-500/5 dark:hover:shadow-indigo-500/10 transition-all duration-200 cursor-pointer"
                      >
                        <div className="flex items-start justify-between mb-3">
                          {a.image_url ? (
                            <img src={a.image_url} alt={a.name} className="w-14 h-14 rounded-xl object-cover shrink-0 group-hover:shadow-md transition-shadow" />
                          ) : (
                            <div className="p-2.5 bg-indigo-50 dark:bg-indigo-900/30 rounded-xl text-indigo-600 dark:text-indigo-400 group-hover:bg-indigo-100 dark:group-hover:bg-indigo-900/50 transition-colors">
                              <Bot size={22} />
                            </div>
                          )}
                          <ArrowRight size={18} className="text-slate-300 dark:text-slate-600 group-hover:text-indigo-500 dark:group-hover:text-indigo-400 group-hover:translate-x-1 transition-all mt-1" />
                        </div>
                        <h4 className="text-base font-semibold text-slate-900 dark:text-white mb-1 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">{a.name}</h4>
                        <p className="text-sm text-slate-500 dark:text-slate-400 line-clamp-2 leading-relaxed">{a.description || 'No description provided'}</p>
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <div className="text-center py-16">
                  <div className="bg-white dark:bg-slate-900 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl p-10 md:p-14 max-w-lg mx-auto">
                    <div className="w-14 h-14 bg-indigo-50 dark:bg-indigo-900/30 rounded-xl flex items-center justify-center mx-auto mb-5">
                      <Zap className="text-indigo-600 dark:text-indigo-400" size={28} />
                    </div>
                    <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">Create Your First Assistant</h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mb-6 max-w-sm mx-auto">Get started by creating an AI assistant with custom instructions and its own isolated knowledge base.</p>
                    <button onClick={() => setShowAddModal(true)} className="px-6 py-3 bg-indigo-600 text-white rounded-xl font-medium shadow-md hover:bg-indigo-500 transition-all inline-flex items-center gap-2">
                      <Plus size={20} /> Create Assistant
                    </button>
                  </div>
                </div>
              )}

            </div>
          </div>
        )}
      </main>

      {/* EDIT MODAL */}
      {showEditModal && (
        <div className="fixed inset-0 bg-slate-50/60 dark:bg-slate-950/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-lg shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-950/50">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Edit Assistant</h2>
              <button onClick={() => setShowEditModal(false)} className="text-slate-500 hover:text-slate-600 dark:text-slate-400 rounded-lg p-1 hover:bg-slate-100 dark:bg-slate-800"><X size={20} /></button>
            </div>
            <form onSubmit={handleUpdateAssistant} className="p-6 space-y-5 max-h-[70vh] overflow-y-auto">
              {/* Avatar Section */}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Avatar</label>
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0 border border-slate-200 dark:border-slate-700">
                    {editAsstImage ? (
                      <img src={URL.createObjectURL(editAsstImage)} alt="Preview" className="w-full h-full object-cover" />
                    ) : editAsstConfig.image_url && !removeEditImage ? (
                      <img src={editAsstConfig.image_url} alt="Avatar" className="w-full h-full object-cover" />
                    ) : (
                      <Bot size={28} className="text-slate-400" />
                    )}
                  </div>
                  <div className="flex flex-col gap-2">
                    <div className="flex gap-2">
                      <input type="file" ref={editAvatarInputRef} accept="image/*" className="hidden" onChange={e => { if (e.target.files?.[0]) { setEditAsstImage(e.target.files[0]); setRemoveEditImage(false); } }} />
                      <button type="button" onClick={() => editAvatarInputRef.current?.click()} className="px-3 py-1.5 text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors flex items-center gap-1.5">
                        <ImageIcon size={14} /> Upload
                      </button>
                      <button type="button" onClick={() => handleGenerateAvatar(editAsstConfig.id)} disabled={generatingAvatar} className="px-3 py-1.5 text-xs font-medium bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 rounded-lg transition-colors flex items-center gap-1.5 disabled:opacity-50">
                        {generatingAvatar ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} Generate
                      </button>
                    </div>
                    {(editAsstConfig.image_url || editAsstImage) && !removeEditImage && (
                      <button type="button" onClick={() => { setRemoveEditImage(true); setEditAsstImage(null); }} className="text-xs text-red-500 hover:text-red-600 dark:hover:text-red-400 transition-colors text-left">
                        Remove image
                      </button>
                    )}
                  </div>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Name <span className="text-red-500">*</span></label>
                <input required type="text" value={editAsstConfig.name} onChange={e => setEditAsstConfig({ ...editAsstConfig, name: e.target.value })} placeholder="e.g. Legal Contract Reviewer" className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white rounded-lg outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Description</label>
                <input type="text" value={editAsstConfig.description} onChange={e => setEditAsstConfig({ ...editAsstConfig, description: e.target.value })} placeholder="Briefly describe its purpose" className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white rounded-lg outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">System Instructions <span className="text-red-500">*</span></label>
                <p className="text-[11px] text-slate-500 mb-2">Define how the AI should behave, its tone, and strict rules.</p>
                <textarea required value={editAsstConfig.instructions} onChange={e => setEditAsstConfig({ ...editAsstConfig, instructions: e.target.value })} rows={5} className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white rounded-lg outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 font-mono text-sm leading-relaxed" />
              </div>
              <div className="pt-2 flex justify-end gap-3">
                <button type="button" onClick={() => setShowEditModal(false)} className="px-5 py-2.5 text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors">Cancel</button>
                <button type="submit" disabled={!editAsstConfig.name || !editAsstConfig.instructions} className="px-5 py-2.5 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm transition-all">Save Changes</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CREATE MODAL */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-50/60 dark:bg-slate-950/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-lg shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-950/50">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Create New Assistant</h2>
              <button onClick={() => setShowAddModal(false)} className="text-slate-500 hover:text-slate-600 dark:text-slate-400 rounded-lg p-1 hover:bg-slate-100 dark:bg-slate-800"><X size={20} /></button>
            </div>
            <form onSubmit={handleCreateAssistant} className="p-6 space-y-5 max-h-[70vh] overflow-y-auto">
              {/* Avatar Section */}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Avatar <span className="text-xs text-slate-400 font-normal">(optional)</span></label>
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0 border border-slate-200 dark:border-slate-700">
                    {newAsstImage ? (
                      <img src={URL.createObjectURL(newAsstImage)} alt="Preview" className="w-full h-full object-cover" />
                    ) : (
                      <Bot size={28} className="text-slate-400" />
                    )}
                  </div>
                  <div className="flex flex-col gap-2">
                    <div className="flex gap-2">
                      <input type="file" ref={newAvatarInputRef} accept="image/*" className="hidden" onChange={e => { if (e.target.files?.[0]) setNewAsstImage(e.target.files[0]); }} />
                      <button type="button" onClick={() => newAvatarInputRef.current?.click()} className="px-3 py-1.5 text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors flex items-center gap-1.5">
                        <ImageIcon size={14} /> Upload Image
                      </button>
                    </div>
                    {newAsstImage && (
                      <button type="button" onClick={() => setNewAsstImage(null)} className="text-xs text-red-500 hover:text-red-600 dark:hover:text-red-400 transition-colors text-left">
                        Remove image
                      </button>
                    )}
                    <p className="text-[11px] text-slate-400">You can generate an AI avatar after creation.</p>
                  </div>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Name <span className="text-red-500">*</span></label>
                <input required type="text" value={newAsstConfig.name} onChange={e => setNewAsstConfig({ ...newAsstConfig, name: e.target.value })} placeholder="e.g. Legal Contract Reviewer" className="w-full px-4 py-2 border border-slate-300 dark:border-slate-700 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Description</label>
                <input type="text" value={newAsstConfig.description} onChange={e => setNewAsstConfig({ ...newAsstConfig, description: e.target.value })} placeholder="Briefly describe its purpose" className="w-full px-4 py-2 border border-slate-300 dark:border-slate-700 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">System Instructions <span className="text-red-500">*</span></label>
                <p className="text-[11px] text-slate-600 dark:text-slate-400 mb-2">Define how the AI should behave, its tone, and strict rules.</p>
                <textarea required value={newAsstConfig.instructions} onChange={e => setNewAsstConfig({ ...newAsstConfig, instructions: e.target.value })} rows={5} className="w-full px-4 py-3 border border-slate-300 dark:border-slate-700 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 font-mono text-sm leading-relaxed bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white" />
              </div>
              <div className="pt-2 flex justify-end gap-3">
                <button type="button" onClick={() => { setShowAddModal(false); setNewAsstImage(null); }} className="px-5 py-2.5 text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors">Cancel</button>
                <button type="submit" disabled={!newAsstConfig.name || !newAsstConfig.instructions} className="px-5 py-2.5 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm transition-all">Launch Assistant</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {assistantToDelete && (
        <div className="fixed inset-0 bg-slate-50/60 dark:bg-slate-950/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-sm shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden p-6 text-center">
            <AlertCircle size={48} className="mx-auto text-red-500 mb-4" />
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">Delete Assistant?</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-6">Are you sure you want to permanently delete "<span className="font-semibold text-slate-700 dark:text-slate-300">{assistantToDelete.name}</span>"? This will also remove all its sessions and knowledge base associations.</p>
            <div className="flex justify-center gap-3">
              <button
                onClick={() => setAssistantToDelete(null)}
                className="px-5 py-2.5 text-sm font-medium text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmDeleteAssistant}
                className="px-5 py-2.5 text-sm font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors shadow-sm"
              >
                Yes, Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DELETE SESSION CONFIRMATION MODAL */}
      {sessionToDelete && (
        <div className="fixed inset-0 bg-slate-50/60 dark:bg-slate-950/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-sm shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden p-6 text-center">
            <AlertCircle size={48} className="mx-auto text-red-500 mb-4" />
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">Delete Conversation?</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-6">Are you sure you want to delete "<span className="font-semibold text-slate-700 dark:text-slate-300">{sessionToDelete.title || "New Conversation"}</span>"? All history will be lost.</p>
            <div className="flex justify-center gap-3">
              <button
                onClick={() => setSessionToDelete(null)}
                className="px-5 py-2.5 text-sm font-medium text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmDeleteSession}
                className="px-5 py-2.5 text-sm font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors shadow-sm"
              >
                Yes, Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DELETE DOCUMENT CONFIRMATION MODAL */}
      {documentToDelete && (
        <div className="fixed inset-0 bg-slate-50/60 dark:bg-slate-950/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-sm shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden p-6 text-center">
            <AlertCircle size={48} className="mx-auto text-red-500 mb-4" />
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">Delete Document?</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-6">Are you sure you want to remove "<span className="font-semibold text-slate-700 dark:text-slate-300">{documentToDelete.filename}</span>" from this assistant's knowledge base?</p>
            <div className="flex justify-center gap-3">
              <button
                onClick={() => setDocumentToDelete(null)}
                className="px-5 py-2.5 text-sm font-medium text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmDeleteDocument}
                className="px-5 py-2.5 text-sm font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors shadow-sm"
              >
                Yes, Delete
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}