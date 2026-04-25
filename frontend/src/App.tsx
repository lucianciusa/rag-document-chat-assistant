import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Send, Upload, Trash2, Loader2, FileText, Menu, X, Plus, BookOpen, MessageSquare, Settings, AlertCircle, Bot, Edit2, ChevronLeft, ChevronRight, Sun, Moon, PanelLeftClose, PanelLeftOpen, Library, ArrowRight, Zap, Sparkles, ImageIcon, ArrowDown, CheckCircle2, Info, Eye, Check, Briefcase, GraduationCap, Code, HeartPulse, Scale, ShieldCheck, Lightbulb, ThumbsUp, ThumbsDown, RotateCcw, Search, Pin, GitBranch, Download, Copy, GripVertical, MoreHorizontal } from 'lucide-react';

interface Assistant {
  id: string;
  name: string;
  description: string;
  instructions: string;
  image_url?: string;
  sort_order?: number;
  pinned?: number;
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
  id?: number;
  role: 'user' | 'assistant';
  content: string;
  citations?: string[];
  feedback?: number | null;
  created_at?: string;
  streaming?: boolean;
}

const SNIPPETS: { label: string; text: string }[] = [
  { label: 'Strict citations', text: 'Always cite the source filename in [brackets] for every factual claim. Never fabricate citations.' },
  { label: 'No hallucination', text: 'If the context does not contain the answer, state clearly that you do not know based on the provided documents.' },
  { label: 'Step-by-step reasoning', text: 'Walk through your reasoning step-by-step before stating the final answer.' },
  { label: 'Concise tone', text: 'Keep answers concise. Avoid filler words and redundant restatements of the question.' },
  { label: 'Formal register', text: 'Maintain a formal, professional tone. Avoid colloquialisms and emojis.' },
  { label: 'Markdown formatting', text: 'Format answers using Markdown: bullet lists for enumerations, fenced code blocks for code, tables where data is comparative.' },
  { label: 'Refuse out-of-scope', text: 'If the user asks about topics unrelated to the provided documents, politely decline and steer back to the documents.' },
];

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
  const [wizardStep, setWizardStep] = useState(0);
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
  const [generatingAssistantId, setGeneratingAssistantId] = useState<string | null>(null);
  const [showCancelAvatarModal, setShowCancelAvatarModal] = useState(false);
  const [showSaveWhileGeneratingModal, setShowSaveWhileGeneratingModal] = useState(false);
  const [generationTime, setGenerationTime] = useState(0);
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  
  const [toastConfig, setToastConfig] = useState<{
    type: 'success' | 'info' | 'error', 
    title: string, 
    description: string,
    action?: { label: string, onClick: () => void }
  } | null>(null);

  const [pendingEdits, setPendingEdits] = useState<Record<string, {
    config: { id: string, name: string, description: string, instructions: string, image_url: string },
    imageFile: File | null,
    removeImage: boolean
  }>>({});

  const showToast = (type: 'success' | 'info' | 'error', title: string, description: string, action?: { label: string, onClick: () => void }) => {
    setToastConfig({ type, title, description, action });
    // If it has an action, maybe keep it longer or until dismissed? Let's keep the timeout but increase to 5s if there is an action.
    setTimeout(() => setToastConfig(null), action ? 8000 : 3000);
  };

  const [showScrollButton, setShowScrollButton] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<{id: string, filename: string} | null>(null);
  const [previewContent, setPreviewContent] = useState<{type: string, filename: string, content?: string, blobUrl?: string} | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  // New feature state
  const [renamingSessionId, setRenamingSessionId] = useState<string | null>(null);
  const [renamingDraft, setRenamingDraft] = useState('');
  const [chatSearchOpen, setChatSearchOpen] = useState(false);
  const [chatSearchQuery, setChatSearchQuery] = useState('');
  const [chatSearchResults, setChatSearchResults] = useState<{id: number, role: string, content: string, created_at?: string}[]>([]);
  const [showSnippets, setShowSnippets] = useState<'edit' | 'create' | null>(null);
  const [draggingAssistantId, setDraggingAssistantId] = useState<string | null>(null);
  const [dragOverAssistantId, setDragOverAssistantId] = useState<string | null>(null);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [assistantMenuOpen, setAssistantMenuOpen] = useState<string | null>(null);
  const streamAbortRef = useRef<AbortController | null>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const chatSearchInputRef = useRef<HTMLInputElement>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const newAvatarInputRef = useRef<HTMLInputElement>(null);
  const editAvatarInputRef = useRef<HTMLInputElement>(null);
  const isAutoScrollingRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);

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

  // Generation Timer
  useEffect(() => {
    let generationTimer: ReturnType<typeof setInterval>;
    if (generatingAssistantId) {
      setGenerationTime(0);
      generationTimer = setInterval(() => {
        setGenerationTime(prev => prev + 1);
      }, 1000);
    } else {
      setGenerationTime(0);
    }
    return () => clearInterval(generationTimer);
  }, [generatingAssistantId]);

  const formatGenerationTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

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

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      const inField = tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement | null)?.isContentEditable;
      const mod = e.ctrlKey || e.metaKey;

      // Esc: close any modal / overlay
      if (e.key === 'Escape') {
        if (chatSearchOpen) { setChatSearchOpen(false); return; }
        if (showExportMenu) { setShowExportMenu(false); return; }
        if (assistantMenuOpen) { setAssistantMenuOpen(null); return; }
        if (renamingSessionId) { setRenamingSessionId(null); return; }
        if (previewImageUrl) { setPreviewImageUrl(null); return; }
        if (previewDoc) { closePreview(); return; }
        if (showCancelAvatarModal) { setShowCancelAvatarModal(false); return; }
        if (showSaveWhileGeneratingModal) { setShowSaveWhileGeneratingModal(false); return; }
        if (showEditModal) { setShowEditModal(false); return; }
        if (showAddModal) { setShowAddModal(false); return; }
        if (assistantToDelete) { setAssistantToDelete(null); return; }
        if (sessionToDelete) { setSessionToDelete(null); return; }
        if (documentToDelete) { setDocumentToDelete(null); return; }
        return;
      }

      // Ctrl/Cmd + K: new chat
      if (mod && e.key.toLowerCase() === 'k' && selectedAssistant) {
        e.preventDefault();
        handleCreateSession();
        return;
      }
      // Ctrl/Cmd + F: search current chat
      if (mod && e.key.toLowerCase() === 'f' && selectedSession) {
        e.preventDefault();
        setChatSearchOpen(true);
        setTimeout(() => chatSearchInputRef.current?.focus(), 50);
        return;
      }
      // Ctrl/Cmd + /: toggle sessions pane
      if (mod && e.key === '/') {
        e.preventDefault();
        setShowChatsPane(p => !p);
        return;
      }
      // Ctrl/Cmd + B: toggle pin on selected assistant
      if (mod && e.key.toLowerCase() === 'b' && !inField && selectedAssistant) {
        e.preventDefault();
        handleTogglePin(selectedAssistant);
        return;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAssistant, selectedSession, chatSearchOpen, showExportMenu, assistantMenuOpen, renamingSessionId, previewImageUrl, previewDoc, showCancelAvatarModal, showSaveWhileGeneratingModal, showEditModal, showAddModal, assistantToDelete, sessionToDelete, documentToDelete]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (isAutoScrollingRef.current) {
      clearTimeout((isAutoScrollingRef as any).timeout);
      (isAutoScrollingRef as any).timeout = setTimeout(() => {
        isAutoScrollingRef.current = false;
        setShowScrollButton(false);
      }, 300);
      return;
    }
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    const isNearBottom = scrollHeight - scrollTop - clientHeight < 150;
    setShowScrollButton(!isNearBottom);
  };

  const scrollToBottom = () => {
    isAutoScrollingRef.current = true;
    setShowScrollButton(false);
    (isAutoScrollingRef as any).timeout = setTimeout(() => { isAutoScrollingRef.current = false; }, 1000);
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
        setWizardStep(0);
        setNewAsstConfig({ name: '', description: '', instructions: 'You are a helpful AI assistant. Answer based only on the provided context.' });
        setNewAsstImage(null);
        fetchAssistants();
        showToast('success', 'Assistant Created', `${newAsstConfig.name} has been successfully created.`);
      }
    } catch (e) {
      console.error(e);
      showToast('error', 'Creation Failed', 'There was an error creating the assistant.');
    }
  };
  // Sync edits to pending background state so they aren't lost
  useEffect(() => {
    if (showEditModal && editAsstConfig.id) {
      setPendingEdits(prev => ({
        ...prev,
        [editAsstConfig.id]: {
          config: editAsstConfig,
          imageFile: editAsstImage,
          removeImage: removeEditImage
        }
      }));
    }
  }, [editAsstConfig, editAsstImage, removeEditImage, showEditModal]);

  const deleteTempAvatar = (file: File | null) => {
    if (file && (file as any).tempUrl) {
      const filename = (file as any).tempUrl.split('/').pop();
      if (filename) fetch(`/api/avatars/${filename}`, { method: 'DELETE' }).catch(console.error);
    }
  };

  const discardPendingEdits = (assistantId: string) => {
    const edit = pendingEdits[assistantId];
    if (edit?.imageFile) deleteTempAvatar(edit.imageFile);
    setPendingEdits(prev => {
      const copy = { ...prev };
      delete copy[assistantId];
      return copy;
    });
    setShowEditModal(false);
  };

  const handleUpdateAssistant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editAsstConfig.name || !editAsstConfig.instructions) return;

    if (generatingAssistantId === editAsstConfig.id) {
      setShowSaveWhileGeneratingModal(true);
      return;
    }

    const originalAsst = assistants.find(a => a.id === editAsstConfig.id);
    const hasChanges = editAsstImage !== null ||
      removeEditImage !== false ||
      originalAsst?.name !== editAsstConfig.name ||
      (originalAsst?.description || '') !== editAsstConfig.description ||
      originalAsst?.instructions !== editAsstConfig.instructions;

    if (!hasChanges) {
      showToast('info', 'No Changes Made', 'Your assistant configuration was already up to date.');
      setShowEditModal(false);
      return;
    }

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
        if (editAsstImage && (editAsstImage as any).tempUrl) {
          deleteTempAvatar(editAsstImage);
        }
        setEditAsstImage(null);
        setRemoveEditImage(false);
        fetchAssistants();
        if (selectedAssistant && selectedAssistant.id === editAsstConfig.id) {
          const updated = await res.json();
          setSelectedAssistant(updated);
        }
        setPendingEdits(prev => {
          const copy = { ...prev };
          delete copy[editAsstConfig.id];
          return copy;
        });
        showToast('success', 'Changes Saved', 'Assistant configuration updated successfully.');
      }
    } catch (e) {
      console.error(e);
      showToast('error', 'Update Failed', 'There was an error updating the assistant.');
    }
  };

  const handleEditAssistantClick = (assistant: Assistant, e: React.MouseEvent) => {
    e.stopPropagation();
    
    // Restore any pending edits for this assistant if they exist
    if (pendingEdits[assistant.id]) {
      setEditAsstConfig(pendingEdits[assistant.id].config);
      setEditAsstImage(pendingEdits[assistant.id].imageFile);
      setRemoveEditImage(pendingEdits[assistant.id].removeImage);
    } else {
      setEditAsstConfig({
        id: assistant.id,
        name: assistant.name,
        description: assistant.description || '',
        instructions: assistant.instructions,
        image_url: assistant.image_url || ''
      });
      setEditAsstImage(null);
      setRemoveEditImage(false);
    }
    
    setShowEditModal(true);
  };

  const handlePreviewDocument = async (doc: {id: string, filename: string}) => {
    setPreviewDoc(doc);
    setPreviewLoading(true);
    setPreviewContent(null);
    const ext = doc.filename.split('.').pop()?.toLowerCase() || '';
    try {
      const res = await fetch(`/api/documents/${doc.id}/preview`);
      if (!res.ok) throw new Error('Failed to load preview');
      if (['md', 'txt', 'csv', 'docx', 'pptx'].includes(ext)) {
        const data = await res.json();
        setPreviewContent({ type: data.type, filename: data.filename, content: data.content });
      } else if (ext === 'pdf') {
        const blob = await res.blob();
        setPreviewContent({ type: 'pdf', filename: doc.filename, blobUrl: URL.createObjectURL(blob) });
      } else if (['png', 'jpg', 'jpeg', 'bmp'].includes(ext)) {
        const blob = await res.blob();
        setPreviewContent({ type: 'image', filename: doc.filename, blobUrl: URL.createObjectURL(blob) });
      }
    } catch (e) {
      console.error(e);
      setPreviewContent({ type: 'error', filename: doc.filename, content: 'Failed to load file preview.' });
    } finally {
      setPreviewLoading(false);
    }
  };

  const closePreview = () => {
    if (previewContent?.blobUrl) URL.revokeObjectURL(previewContent.blobUrl);
    setPreviewDoc(null);
    setPreviewContent(null);
  };

  const handleGenerateAvatar = async (assistantId: string) => {
    if (generatingAssistantId && generatingAssistantId !== assistantId) {
      showToast('error', 'Generation in Progress', 'An avatar is already being generated for another assistant.');
      return;
    }

    setGeneratingAssistantId(assistantId);
    abortControllerRef.current = new AbortController();
    try {
      const res = await fetch(`/api/assistants/${assistantId}/avatar/generate`, {
        method: 'POST',
        signal: abortControllerRef.current.signal
      });
      if (res.ok) {
        const data = await res.json();

        // Fetch the temporary image to stick it into our File state
        const imgRes = await fetch(data.image_url);
        const blob = await imgRes.blob();
        const file = new File([blob], 'generated_avatar.png', { type: blob.type || 'image/png' });
        (file as any).tempUrl = data.image_url;

        setPendingEdits(prev => ({
          ...prev,
          [assistantId]: {
            config: prev[assistantId]?.config || editAsstConfig,
            imageFile: file,
            removeImage: false
          }
        }));

        setEditAsstImage(prev => {
          // Only update the live modal if they are still looking at the same assistant
          if (editAsstConfig.id === assistantId) {
            setRemoveEditImage(false);
            return file;
          }
          return prev;
        });

        showToast('success', 'Generation Complete', 'Your new avatar is ready to review.', {
          label: 'Review',
          onClick: () => {
            const assistant = assistants.find(a => a.id === assistantId);
            if (assistant) handleEditAssistantClick(assistant, {} as any);
          }
        });
      } else {
        const err = await res.json();
        showToast('error', 'Generation Failed', err.detail || 'Failed to generate avatar');
      }
    } catch (e: any) {
      if (e.name === 'AbortError') {
        console.log('Avatar generation aborted by user.');
        return;
      }
      console.error(e);
      showToast('error', 'Generation Failed', 'Failed to generate avatar');
    } finally {
      setGeneratingAssistantId(null);
      abortControllerRef.current = null;
    }
  };

  const handleDeleteAssistant = (assistant: Assistant, e: React.MouseEvent) => {
    e.stopPropagation();
    setAssistantToDelete(assistant);
  };

  const confirmDeleteAssistant = async () => {
    if (!assistantToDelete) return;
    try {
      const res = await fetch(`/api/assistants/${assistantToDelete.id}`, { method: 'DELETE' });
      if (res.ok) {
        if (selectedAssistant?.id === assistantToDelete.id) setSelectedAssistant(null);
        fetchAssistants();
        showToast('success', 'Assistant Deleted', `Successfully deleted ${assistantToDelete.name}.`);
      }
    } catch (e) {
      console.error(e);
      showToast('error', 'Deletion Failed', 'There was an error deleting the assistant.');
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
      const res = await fetch(`/api/sessions/${sessionToDelete.id}`, { method: 'DELETE' });
      if (res.ok) {
        if (selectedSession?.id === sessionToDelete.id) {
          setSelectedSession(null);
          setMessages([]);
        }
        fetchSessions(selectedAssistant.id);
        showToast('success', 'Chat Deleted', 'The conversation has been removed.');
      }
    } catch (e) {
      console.error(e);
      showToast('error', 'Deletion Failed', 'There was an error deleting the conversation.');
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
      isAutoScrollingRef.current = true;
      setShowScrollButton(false);
      (isAutoScrollingRef as any).timeout = setTimeout(() => { isAutoScrollingRef.current = false; }, 1000);
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 50);
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
        const res = await fetch(`/api/assistants/${selectedAssistant.id}/documents/`, { method: 'POST', body: formData });
        if (!res.ok) throw new Error();
      } catch (err) {
        showToast('error', 'Upload Failed', `Failed to upload ${file.name}`);
      }
    }

    setUploading(false);
    fetchDocuments(selectedAssistant.id);
    if (fileInputRef.current) fileInputRef.current.value = '';
    showToast('success', 'Files Uploaded', 'Your documents have been processed.');
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
      const res = await fetch(`/api/documents/${documentToDelete.id}`, { method: 'DELETE' });
      if (res.ok) {
        if (selectedAssistant) fetchDocuments(selectedAssistant.id);
        showToast('success', 'File Deleted', `Removed ${documentToDelete.filename} from the knowledge base.`);
      }
    } catch (e) {
      console.error(e);
      showToast('error', 'Deletion Failed', 'There was an error deleting the file.');
    }
    setDocumentToDelete(null);
  };

  const consumeStream = async (
    sessionId: string,
    body: object,
    endpoint: 'chat/stream' | 'regenerate'
  ): Promise<void> => {
    streamAbortRef.current?.abort();
    streamAbortRef.current = new AbortController();

    const placeholderIdx = messages.length; // approximate; actual index resolved via setter
    setMessages(prev => [...prev, { role: 'assistant', content: '', streaming: true, created_at: new Date().toISOString() }]);

    try {
      const response = await fetch(`/api/sessions/${sessionId}/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: streamAbortRef.current.signal,
      });

      if (!response.ok || !response.body) throw new Error('API Error');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // Parse SSE events delimited by \n\n
        let sepIdx;
        while ((sepIdx = buffer.indexOf('\n\n')) !== -1) {
          const rawEvent = buffer.slice(0, sepIdx);
          buffer = buffer.slice(sepIdx + 2);
          const lines = rawEvent.split('\n');
          for (const line of lines) {
            if (!line.startsWith('data:')) continue;
            const json = line.slice(5).trim();
            if (!json) continue;
            try {
              const evt = JSON.parse(json);
              if (evt.type === 'token') {
                setMessages(prev => prev.map((m, i) => i === prev.length - 1 ? { ...m, content: m.content + evt.content } : m));
              } else if (evt.type === 'user_meta') {
                // back-fill the user message id from the server
                setMessages(prev => {
                  const copy = [...prev];
                  // user message is the one before the streaming assistant placeholder
                  const userIdx = copy.length - 2;
                  if (userIdx >= 0 && copy[userIdx].role === 'user' && copy[userIdx].id === undefined) {
                    copy[userIdx] = { ...copy[userIdx], id: evt.id, created_at: evt.created_at };
                  }
                  return copy;
                });
              } else if (evt.type === 'done') {
                setMessages(prev => prev.map((m, i) => i === prev.length - 1 ? { ...m, id: evt.id, citations: evt.citations, created_at: evt.created_at, streaming: false } : m));
                if (selectedAssistant) fetchSessions(selectedAssistant.id);
              } else if (evt.type === 'error') {
                setMessages(prev => prev.map((m, i) => i === prev.length - 1 ? { ...m, content: `Error: ${evt.message}`, streaming: false } : m));
              }
            } catch {/* ignore malformed line */}
          }
        }
      }
    } catch (e: any) {
      if (e.name !== 'AbortError') {
        setMessages(prev => prev.map((m, i) => i === prev.length - 1 ? { ...m, content: m.content || "Sorry, I encountered an error. Please try again.", streaming: false } : m));
      }
    } finally {
      void placeholderIdx;
      streamAbortRef.current = null;
    }
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading || !selectedSession) return;

    const userMessage = input.trim();
    setInput('');
    const userCreatedAt = new Date().toISOString();
    setMessages(prev => [...prev, { role: 'user', content: userMessage, created_at: userCreatedAt }]);
    setIsLoading(true);

    // Auto-scroll instantly when user sends message
    isAutoScrollingRef.current = true;
    setShowScrollButton(false);
    (isAutoScrollingRef as any).timeout = setTimeout(() => { isAutoScrollingRef.current = false; }, 1000);
    setTimeout(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, 50);

    await consumeStream(selectedSession.id, { query: userMessage }, 'chat/stream');

    setIsLoading(false);
    isAutoScrollingRef.current = true;
    setShowScrollButton(false);
    (isAutoScrollingRef as any).timeout = setTimeout(() => { isAutoScrollingRef.current = false; }, 1000);
    setTimeout(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, 50);
  };

  // -------- Feedback --------
  const handleFeedback = async (messageId: number | undefined, value: -1 | 1) => {
    if (messageId === undefined) return;
    setMessages(prev => prev.map(m => m.id === messageId ? { ...m, feedback: m.feedback === value ? null : value } : m));
    const newVal = messages.find(m => m.id === messageId)?.feedback === value ? null : value;
    try {
      await fetch(`/api/messages/${messageId}/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feedback: newVal }),
      });
    } catch (e) { console.error(e); }
  };

  // -------- Regenerate --------
  const handleRegenerate = async () => {
    if (!selectedSession || isLoading) return;
    setIsLoading(true);
    setMessages(prev => {
      const copy = [...prev];
      while (copy.length && copy[copy.length - 1].role === 'assistant') copy.pop();
      return copy;
    });
    try {
      const res = await fetch(`/api/sessions/${selectedSession.id}/regenerate`, { method: 'POST' });
      if (!res.ok) throw new Error('Regenerate failed');
      const data = await res.json();
      setMessages(prev => [...prev, { id: data.id, role: 'assistant', content: data.reply, citations: data.citations, created_at: data.created_at }]);
      if (selectedAssistant) fetchSessions(selectedAssistant.id);
    } catch (e) {
      console.error(e);
      showToast('error', 'Regeneration Failed', 'Unable to regenerate the response.');
    } finally {
      setIsLoading(false);
    }
  };

  // -------- Rename session --------
  const startRenameSession = (s: ChatSession) => {
    setRenamingSessionId(s.id);
    setRenamingDraft(s.title || 'New Conversation');
    setTimeout(() => renameInputRef.current?.focus(), 50);
  };

  const commitRenameSession = async () => {
    if (!renamingSessionId) return;
    const newTitle = renamingDraft.trim();
    const id = renamingSessionId;
    setRenamingSessionId(null);
    if (!newTitle) return;
    try {
      const res = await fetch(`/api/sessions/${id}/title`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle }),
      });
      if (res.ok) {
        const updated = await res.json();
        setSessions(prev => prev.map(s => s.id === id ? { ...s, title: updated.title } : s));
        if (selectedSession?.id === id) setSelectedSession({ ...selectedSession, title: updated.title });
      }
    } catch (e) { console.error(e); }
  };

  // -------- Conversation search --------
  const runChatSearch = async (q: string) => {
    if (!selectedSession) return;
    if (!q.trim()) { setChatSearchResults([]); return; }
    try {
      const res = await fetch(`/api/sessions/${selectedSession.id}/search?q=${encodeURIComponent(q)}`);
      if (res.ok) setChatSearchResults(await res.json());
    } catch (e) { console.error(e); }
  };

  // -------- Clone assistant --------
  const handleCloneAssistant = async (assistant: Assistant) => {
    setAssistantMenuOpen(null);
    try {
      const res = await fetch(`/api/assistants/${assistant.id}/clone`, { method: 'POST' });
      if (!res.ok) throw new Error();
      await fetchAssistants();
      showToast('success', 'Assistant Cloned', `Created a copy of ${assistant.name}.`);
    } catch (e) {
      console.error(e);
      showToast('error', 'Clone Failed', 'Unable to clone the assistant.');
    }
  };

  // -------- Branch session --------
  const handleBranchFromMessage = async (messageId: number | undefined) => {
    if (messageId === undefined || !selectedSession || !selectedAssistant) return;
    try {
      const res = await fetch(`/api/sessions/${selectedSession.id}/branch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from_message_id: messageId }),
      });
      if (!res.ok) throw new Error();
      const newSession = await res.json();
      await fetchSessions(selectedAssistant.id);
      setSelectedSession(newSession);
      showToast('success', 'Conversation Branched', 'Forked into a new chat.');
    } catch (e) {
      console.error(e);
      showToast('error', 'Branch Failed', 'Unable to branch the conversation.');
    }
  };

  // -------- Toggle pin / reorder assistants --------
  const persistAssistantOrder = async (items: Assistant[]) => {
    const payload = items.map((a, i) => ({ id: a.id, sort_order: i, pinned: a.pinned ?? 0 }));
    try {
      await fetch('/api/assistants/order', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: payload }),
      });
    } catch (e) { console.error(e); }
  };

  const handleTogglePin = async (a: Assistant) => {
    setAssistantMenuOpen(null);
    const newPinned = a.pinned ? 0 : 1;
    setAssistants(prev => {
      const updated = prev.map(x => x.id === a.id ? { ...x, pinned: newPinned } : x);
      // re-sort: pinned first, then sort_order
      updated.sort((x, y) => (y.pinned ?? 0) - (x.pinned ?? 0) || (x.sort_order ?? 0) - (y.sort_order ?? 0));
      void persistAssistantOrder(updated);
      return updated;
    });
  };

  const handleAssistantDrop = (targetId: string) => {
    if (!draggingAssistantId || draggingAssistantId === targetId) {
      setDraggingAssistantId(null); setDragOverAssistantId(null); return;
    }
    setAssistants(prev => {
      const fromIdx = prev.findIndex(a => a.id === draggingAssistantId);
      const toIdx = prev.findIndex(a => a.id === targetId);
      if (fromIdx === -1 || toIdx === -1) return prev;
      const copy = [...prev];
      const [moved] = copy.splice(fromIdx, 1);
      copy.splice(toIdx, 0, moved);
      // Pinned stay on top: re-sort by pinned desc; preserve new in-group order via sequential indices
      const pinned = copy.filter(a => a.pinned);
      const unpinned = copy.filter(a => !a.pinned);
      const merged = [...pinned, ...unpinned];
      void persistAssistantOrder(merged);
      return merged;
    });
    setDraggingAssistantId(null);
    setDragOverAssistantId(null);
  };

  // -------- Export chat --------
  const buildChatMarkdown = (): string => {
    if (!selectedAssistant || !selectedSession) return '';
    const header = `# ${selectedSession.title || 'Conversation'}\n\nAssistant: **${selectedAssistant.name}**\n\nExported: ${new Date().toLocaleString()}\n\n---\n\n`;
    const body = messages.map(m => {
      const ts = m.created_at ? `*${new Date(m.created_at).toLocaleString()}*\n\n` : '';
      const who = m.role === 'user' ? 'You' : selectedAssistant.name;
      const cite = m.citations && m.citations.length ? `\n\n_Sources: ${m.citations.join(', ')}_` : '';
      return `### ${who}\n${ts}${m.content}${cite}`;
    }).join('\n\n');
    return header + body + '\n';
  };

  const handleExportMarkdown = () => {
    setShowExportMenu(false);
    const md = buildChatMarkdown();
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(selectedSession?.title || 'conversation').replace(/[^\w\-]+/g, '_')}.md`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  };

  const handleExportPdf = () => {
    setShowExportMenu(false);
    if (!selectedAssistant || !selectedSession) return;
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${selectedSession.title || 'Conversation'}</title>
<style>
body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:780px;margin:24px auto;color:#0f172a;padding:0 20px;}
h1{margin-bottom:4px}
.meta{color:#64748b;font-size:12px;margin-bottom:24px}
.msg{padding:12px 14px;border-radius:8px;margin:10px 0}
.user{background:#eef2ff;border:1px solid #c7d2fe}
.asst{background:#f8fafc;border:1px solid #e2e8f0}
.role{font-weight:600;font-size:12px;text-transform:uppercase;color:#475569;margin-bottom:6px}
.cite{font-size:11px;color:#64748b;margin-top:8px}
pre{white-space:pre-wrap;word-break:break-word;font-family:inherit;margin:0}
</style></head><body>
<h1>${selectedSession.title || 'Conversation'}</h1>
<div class="meta">Assistant: ${selectedAssistant.name} · Exported ${new Date().toLocaleString()}</div>
${messages.map(m => `<div class="msg ${m.role}"><div class="role">${m.role === 'user' ? 'You' : selectedAssistant.name}</div><pre>${(m.content || '').replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' } as any)[c])}</pre>${m.citations && m.citations.length ? `<div class="cite">Sources: ${m.citations.join(', ')}</div>` : ''}</div>`).join('')}
<script>window.onload=()=>{window.print();}</script>
</body></html>`;
    const win = window.open('', '_blank');
    if (!win) { showToast('error', 'Export Failed', 'Pop-ups are blocked.'); return; }
    win.document.open(); win.document.write(html); win.document.close();
  };

  // -------- Citation drill-down --------
  const handleCitationClick = (filename: string) => {
    const doc = documents.find(d => d.filename === filename);
    if (!doc) {
      showToast('info', 'Document Unavailable', `${filename} is no longer in the knowledge base.`);
      return;
    }
    handlePreviewDocument({ id: doc.id, filename: doc.filename });
  };

  // ---- Helpers ----
  const getDateGroup = (dateStr?: string) => {
    if (!dateStr) return null;
    const date = new Date(dateStr);
    return new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Paris', year: 'numeric', month: 'numeric', day: 'numeric' }).format(date);
  };

  const formatDateSeparator = (dateStr?: string) => {
    if (!dateStr) return '';
    const targetGroup = getDateGroup(dateStr);

    const now = new Date();
    const todayGroup = getDateGroup(now.toISOString());

    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayGroup = getDateGroup(yesterday.toISOString());

    if (targetGroup === todayGroup) return 'Today';
    if (targetGroup === yesterdayGroup) return 'Yesterday';

    const date = new Date(dateStr);
    return new Intl.DateTimeFormat(undefined, { timeZone: 'Europe/Paris', month: 'long', day: 'numeric', year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined }).format(date);
  };

  const formatTime = (dateStr?: string) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleTimeString(undefined, { timeZone: 'Europe/Paris', hour: 'numeric', minute: '2-digit' });
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
                  draggable
                  onDragStart={() => setDraggingAssistantId(a.id)}
                  onDragOver={(e) => { e.preventDefault(); setDragOverAssistantId(a.id); }}
                  onDragLeave={() => { if (dragOverAssistantId === a.id) setDragOverAssistantId(null); }}
                  onDrop={(e) => { e.preventDefault(); handleAssistantDrop(a.id); }}
                  onDragEnd={() => { setDraggingAssistantId(null); setDragOverAssistantId(null); }}
                  onClick={() => setSelectedAssistant(a)}
                  className={`w-full text-left px-2 py-3 rounded-lg flex items-center justify-between cursor-pointer group transition-colors ${selectedAssistant?.id === a.id ? 'bg-slate-200 dark:bg-slate-800 text-slate-900 dark:text-white' : 'hover:bg-slate-100 dark:hover:bg-slate-800/60 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'} ${dragOverAssistantId === a.id && draggingAssistantId !== a.id ? 'ring-2 ring-indigo-400 dark:ring-indigo-500' : ''} ${draggingAssistantId === a.id ? 'opacity-50' : ''}`}
                >
                  <div className="flex items-center gap-2 overflow-hidden flex-1">
                    <span className="text-slate-400 dark:text-slate-600 cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity" title="Drag to reorder">
                      <GripVertical size={14} />
                    </span>
                    {a.image_url ? (
                      <img src={a.image_url} alt={a.name} className="w-7 h-7 rounded-lg object-cover shrink-0" />
                    ) : (
                      <Bot size={18} className={selectedAssistant?.id === a.id ? "text-indigo-600 dark:text-indigo-400" : "text-slate-600 dark:text-slate-400 group-hover:text-indigo-500"} />
                    )}
                    <div className="truncate flex items-center gap-1.5 min-w-0">
                      <span className="text-sm font-medium truncate">{a.name}</span>
                      {!!a.pinned && <Pin size={11} className="text-amber-500 shrink-0 fill-amber-500" />}
                    </div>
                  </div>
                  <div className="flex gap-1 items-center shrink-0">
                    <div className="relative">
                      <button onClick={(e) => { e.stopPropagation(); setAssistantMenuOpen(assistantMenuOpen === a.id ? null : a.id); }} className="p-1 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-300 dark:hover:bg-slate-700 rounded transition-all opacity-0 group-hover:opacity-100">
                        <MoreHorizontal size={14} />
                      </button>
                      {assistantMenuOpen === a.id && (
                        <div className="absolute right-0 top-full mt-1 z-50 w-44 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg py-1 text-sm">
                          <button onClick={(e) => { e.stopPropagation(); handleEditAssistantClick(a, e); setAssistantMenuOpen(null); }} className="w-full text-left px-3 py-2 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 flex items-center gap-2"><Edit2 size={14}/> Edit</button>
                          <button onClick={(e) => { e.stopPropagation(); handleTogglePin(a); }} className="w-full text-left px-3 py-2 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 flex items-center gap-2"><Pin size={14}/> {a.pinned ? 'Unpin' : 'Pin'}</button>
                          <button onClick={(e) => { e.stopPropagation(); handleCloneAssistant(a); }} className="w-full text-left px-3 py-2 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 flex items-center gap-2"><Copy size={14}/> Clone</button>
                          <button onClick={(e) => { e.stopPropagation(); setAssistantMenuOpen(null); handleDeleteAssistant(a, e); }} className="w-full text-left px-3 py-2 hover:bg-red-50 dark:hover:bg-red-500/10 text-red-600 dark:text-red-400 flex items-center gap-2"><Trash2 size={14}/> Delete</button>
                        </div>
                      )}
                    </div>
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

              <div className="flex items-center gap-2 shrink-0">
                {activeTab === 'chat' && selectedSession && (
                  <>
                    <button
                      onClick={() => { setChatSearchOpen(true); setTimeout(() => chatSearchInputRef.current?.focus(), 50); }}
                      title="Search this chat (Ctrl+F)"
                      className="p-2 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors"
                    >
                      <Search size={16} />
                    </button>
                    <div className="relative">
                      <button
                        onClick={() => setShowExportMenu(o => !o)}
                        title="Export conversation"
                        className="p-2 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors"
                      >
                        <Download size={16} />
                      </button>
                      {showExportMenu && (
                        <div className="absolute right-0 mt-1 w-44 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg py-1 z-50 text-sm">
                          <button onClick={handleExportMarkdown} className="w-full text-left px-3 py-2 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 flex items-center gap-2"><FileText size={14}/> Export as .md</button>
                          <button onClick={handleExportPdf} className="w-full text-left px-3 py-2 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 flex items-center gap-2"><FileText size={14}/> Export as .pdf</button>
                        </div>
                      )}
                    </div>
                  </>
                )}
                <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
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
                        onClick={() => { if (renamingSessionId !== s.id) setSelectedSession(s); }}
                        onDoubleClick={(e) => { e.stopPropagation(); startRenameSession(s); }}
                        className={`w-full group px-3 py-2.5 rounded-md cursor-pointer transition-colors ${selectedSession?.id === s.id ? 'bg-indigo-50 dark:bg-indigo-900/30 font-medium' : 'hover:bg-slate-200 dark:hover:bg-slate-800'}`}
                      >
                        <div className="flex items-center justify-between">
                          {renamingSessionId === s.id ? (
                            <input
                              ref={renameInputRef}
                              value={renamingDraft}
                              onClick={(e) => e.stopPropagation()}
                              onChange={(e) => setRenamingDraft(e.target.value)}
                              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commitRenameSession(); } if (e.key === 'Escape') { setRenamingSessionId(null); } }}
                              onBlur={commitRenameSession}
                              className="flex-1 text-sm bg-white dark:bg-slate-900 border border-indigo-400 dark:border-indigo-500 rounded px-2 py-0.5 outline-none text-slate-900 dark:text-white"
                            />
                          ) : (
                            <span className={`truncate pr-2 text-sm ${selectedSession?.id === s.id ? 'text-indigo-700 dark:text-indigo-300 font-semibold' : 'text-slate-700 dark:text-slate-300 group-hover:text-slate-900 dark:group-hover:text-white'}`}>{s.title || "New Conversation"}</span>
                          )}
                          {renamingSessionId !== s.id && (
                            <div className="flex items-center gap-0.5 shrink-0">
                              <button
                                onClick={(e) => { e.stopPropagation(); startRenameSession(s); }}
                                className={`opacity-0 group-hover:opacity-100 p-1.5 text-slate-500 hover:text-indigo-500 hover:bg-indigo-50 dark:hover:text-indigo-400 dark:hover:bg-indigo-500/10 rounded transition-all`}
                                title="Rename"
                              >
                                <Edit2 size={13} />
                              </button>
                              <button
                                onClick={(e) => handleDeleteSession(s, e)}
                                className={`opacity-0 group-hover:opacity-100 p-1.5 text-slate-500 hover:text-red-500 hover:bg-red-50 dark:hover:text-red-400 dark:hover:bg-red-500/10 rounded transition-all ${selectedSession?.id === s.id ? 'text-indigo-500 dark:text-indigo-400 hover:text-red-500 hover:bg-red-50 dark:hover:text-red-400 dark:hover:bg-red-500/10' : ''}`}
                                title="Delete Session"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          )}
                        </div>
                        <div className={`text-[10px] mt-0.5 ${selectedSession?.id === s.id ? 'text-indigo-400/70' : 'text-slate-500'}`}>
                          {s.updated_at ? new Date(s.updated_at + 'Z').toLocaleDateString('en-US', { timeZone: 'Europe/Paris', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Just now'}
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

                      <div className="flex-1 overflow-y-auto p-4 md:p-8 w-full relative" onScroll={handleScroll}>
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

                            let showDateSeparator = false;
                            let dateSeparatorText = '';
                            if (msg.created_at) {
                              const currentGroup = getDateGroup(msg.created_at);
                              const prevGroup = index > 0 ? getDateGroup(messages[index - 1].created_at) : null;
                              if (currentGroup && currentGroup !== prevGroup) {
                                showDateSeparator = true;
                                dateSeparatorText = formatDateSeparator(msg.created_at);
                              }
                            }

                            return (
                              <React.Fragment key={index}>
                                {showDateSeparator && (
                                  <div className="flex justify-center my-6">
                                    <span className="text-[11px] font-medium text-slate-500 bg-slate-100 dark:bg-slate-800/60 px-3 py-1 rounded-full uppercase tracking-wider">{dateSeparatorText}</span>
                                  </div>
                                )}
                                <div className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
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
                                            <button
                                              key={i}
                                              onClick={() => handleCitationClick(cite)}
                                              title={`Open ${cite}`}
                                              className="inline-flex items-center px-2 py-1 rounded bg-white dark:bg-slate-900 shadow-sm border border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-400 font-medium hover:border-indigo-400 dark:hover:border-indigo-500 hover:text-indigo-600 dark:hover:text-indigo-300 transition-colors"
                                            >
                                              <FileText size={10} className="mr-1 text-indigo-400" />
                                              {cite}
                                            </button>
                                          ))}
                                        </div>
                                      </div>
                                    )}

                                    {msg.created_at && (
                                      <div className={`text-[10px] mt-2 font-medium ${msg.role === 'user' ? 'text-indigo-200 text-right' : 'text-slate-400 dark:text-slate-500 text-left'}`}>
                                        {formatTime(msg.created_at)}
                                      </div>
                                    )}
                                  </div>
                                </div>
                                {msg.role === 'assistant' && !msg.streaming && msg.id !== undefined && (
                                  <div className="flex items-center gap-1 -mt-3 ml-1 text-slate-400 dark:text-slate-500">
                                    <button
                                      onClick={() => handleFeedback(msg.id, 1)}
                                      title="Helpful"
                                      className={`p-1.5 rounded-md transition-colors ${msg.feedback === 1 ? 'text-emerald-500 bg-emerald-50 dark:bg-emerald-500/10' : 'hover:text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-500/10'}`}
                                    >
                                      <ThumbsUp size={13} />
                                    </button>
                                    <button
                                      onClick={() => handleFeedback(msg.id, -1)}
                                      title="Not helpful"
                                      className={`p-1.5 rounded-md transition-colors ${msg.feedback === -1 ? 'text-red-500 bg-red-50 dark:bg-red-500/10' : 'hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10'}`}
                                    >
                                      <ThumbsDown size={13} />
                                    </button>
                                    <button
                                      onClick={() => handleBranchFromMessage(msg.id)}
                                      title="Branch conversation here"
                                      className="p-1.5 rounded-md hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 transition-colors"
                                    >
                                      <GitBranch size={13} />
                                    </button>
                                    {index === messages.length - 1 && (
                                      <button
                                        onClick={handleRegenerate}
                                        disabled={isLoading}
                                        title="Regenerate"
                                        className="p-1.5 rounded-md hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                      >
                                        <RotateCcw size={13} />
                                      </button>
                                    )}
                                  </div>
                                )}
                              </React.Fragment>
                            )
                          })}

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
                          <div className="w-24 text-right">Actions</div>
                        </div>
                        <ul className="divide-y divide-slate-200 dark:divide-slate-800/80 bg-white dark:bg-slate-900">
                          {documents.map(doc => (
                            <li key={doc.id} className="px-4 py-3 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                              <div className="flex items-center gap-3 overflow-hidden">
                                <FileText size={16} className="text-indigo-500 shrink-0" />
                                <button onClick={() => handlePreviewDocument(doc)} className="text-sm font-medium text-slate-700 dark:text-slate-300 truncate hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors text-left" title="Preview file">{doc.filename}</button>
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                <button onClick={() => handlePreviewDocument(doc)} className="p-1.5 text-slate-400 hover:text-indigo-500 hover:bg-indigo-500/10 rounded-md transition-colors" title="Preview">
                                  <Eye size={16} />
                                </button>
                                <button onClick={() => handleDeleteDocument(doc)} className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-500/10 rounded-md transition-colors" title="Delete">
                                  <Trash2 size={16} />
                                </button>
                              </div>
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
              <button onClick={() => {
                if (generatingAssistantId === editAsstConfig?.id) {
                  setShowCancelAvatarModal(true);
                } else {
                  setShowEditModal(false);
                }
              }} className="text-slate-500 hover:text-slate-600 dark:text-slate-400 rounded-lg p-1 hover:bg-slate-100 dark:bg-slate-800"><X size={20} /></button>
            </div>
            <form onSubmit={handleUpdateAssistant} className="p-6 space-y-5 max-h-[70vh] overflow-y-auto">
              {/* Avatar Section */}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Avatar</label>
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0 border border-slate-200 dark:border-slate-700">
                    {editAsstImage ? (
                      <img src={URL.createObjectURL(editAsstImage)} alt="Preview" className="w-full h-full object-cover cursor-pointer hover:opacity-80 transition-opacity" onClick={() => setPreviewImageUrl(URL.createObjectURL(editAsstImage))} />
                    ) : editAsstConfig.image_url && !removeEditImage ? (
                      <img src={editAsstConfig.image_url} alt="Avatar" className="w-full h-full object-cover cursor-pointer hover:opacity-80 transition-opacity" onClick={() => setPreviewImageUrl(editAsstConfig.image_url!)} />
                    ) : (
                      <Bot size={28} className="text-slate-400" />
                    )}
                  </div>
                  <div className="flex flex-col gap-2">
                    <div className="flex gap-2">
                      <input type="file" ref={editAvatarInputRef} accept="image/*" className="hidden" onChange={e => { if (e.target.files?.[0]) { deleteTempAvatar(editAsstImage); setEditAsstImage(e.target.files[0]); setRemoveEditImage(false); } }} />
                      <button type="button" onClick={() => editAvatarInputRef.current?.click()} className="px-3 py-1.5 text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors flex items-center gap-1.5">
                        <ImageIcon size={14} /> Upload
                      </button>
                      <button type="button" onClick={() => handleGenerateAvatar(editAsstConfig.id)} disabled={generatingAssistantId !== null} className={`px-3 py-1.5 text-xs font-medium bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-lg transition-colors flex items-center gap-1.5 ${generatingAssistantId !== null ? 'opacity-50 cursor-not-allowed' : 'hover:bg-indigo-100 dark:hover:bg-indigo-900/50'}`}>
                        {generatingAssistantId === editAsstConfig.id ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} Generate
                      </button>
                      {generatingAssistantId === editAsstConfig.id && (
                        <div className="flex items-center gap-2 ml-1">
                          <span className="text-xs text-slate-500 font-mono bg-slate-100 dark:bg-slate-800 px-2 py-1.5 rounded-md border border-slate-200 dark:border-slate-700">{formatGenerationTime(generationTime)}</span>
                          <button type="button" onClick={() => { abortControllerRef.current?.abort(); }} className="px-2.5 py-1.5 text-xs font-medium bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-500/10 dark:text-red-400 dark:hover:bg-red-500/20 rounded-lg transition-colors flex items-center gap-1">
                            Cancel
                          </button>
                        </div>
                      )}
                    </div>
                    {(editAsstConfig.image_url || editAsstImage) && !removeEditImage && (
                      <button type="button" onClick={() => { deleteTempAvatar(editAsstImage); setRemoveEditImage(true); setEditAsstImage(null); }} className="text-xs text-red-500 hover:text-red-600 dark:hover:text-red-400 transition-colors text-left">
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
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">System Instructions <span className="text-red-500">*</span></label>
                  <div className="relative">
                    <button type="button" onClick={() => setShowSnippets(showSnippets === 'edit' ? null : 'edit')} className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1"><Plus size={12}/> Insert snippet</button>
                    {showSnippets === 'edit' && (
                      <div className="absolute right-0 top-full mt-1 w-72 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg py-1 z-50 text-sm">
                        {SNIPPETS.map((sn, i) => (
                          <button key={i} type="button" onClick={() => { setEditAsstConfig(c => ({ ...c, instructions: (c.instructions ? c.instructions + '\n\n' : '') + sn.text })); setShowSnippets(null); }} className="w-full text-left px-3 py-2 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300">
                            <div className="font-medium text-xs text-slate-900 dark:text-white">{sn.label}</div>
                            <div className="text-[11px] text-slate-500 truncate">{sn.text}</div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <p className="text-[11px] text-slate-500 mb-2">Define how the AI should behave, its tone, and strict rules.</p>
                <textarea required value={editAsstConfig.instructions} onChange={e => setEditAsstConfig({ ...editAsstConfig, instructions: e.target.value })} rows={5} className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white rounded-lg outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 font-mono text-sm leading-relaxed" />
              </div>
              <div className="pt-2 flex justify-end gap-3">
                <button type="button" onClick={() => discardPendingEdits(editAsstConfig.id)} className="px-5 py-2.5 text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors">Cancel</button>
                <button type="submit" disabled={!editAsstConfig.name || !editAsstConfig.instructions} className="px-5 py-2.5 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm transition-all">Save Changes</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CREATION WIZARD */}
      {showAddModal && (() => {
        const wizardSteps = [
          { label: 'Basics', icon: <Briefcase size={16} /> },
          { label: 'Instructions', icon: <BookOpen size={16} /> },
          { label: 'Avatar', icon: <ImageIcon size={16} /> },
          { label: 'Review', icon: <Check size={16} /> },
        ];
        const instructionTemplates = [
          { label: 'General Assistant', icon: <Lightbulb size={16} />, value: 'You are a helpful AI assistant. Answer based only on the provided context.' },
          { label: 'Legal Advisor', icon: <Scale size={16} />, value: 'You are a legal analysis assistant. Provide precise, citation-backed legal interpretations based only on the provided documents. Always clarify that your analysis is informational, not legal advice.' },
          { label: 'Code Reviewer', icon: <Code size={16} />, value: 'You are a senior code reviewer. Analyze code snippets and documents for bugs, security vulnerabilities, and best-practice violations. Provide actionable suggestions with corrected code examples.' },
          { label: 'Medical Research', icon: <HeartPulse size={16} />, value: 'You are a medical research assistant. Summarize clinical findings, compare study methodologies, and extract key data points from provided medical documents. Always note limitations and recommend professional consultation.' },
          { label: 'Academic Tutor', icon: <GraduationCap size={16} />, value: 'You are an academic tutor. Explain concepts from the provided materials in clear, simple language. Use examples, analogies, and step-by-step breakdowns. Ask follow-up questions to check understanding.' },
          { label: 'Compliance Auditor', icon: <ShieldCheck size={16} />, value: 'You are a compliance and policy auditor. Analyze provided documents against regulatory frameworks and internal policies. Flag non-compliant sections, assess risk levels, and suggest remediation steps.' },
        ];
        const canProceed = wizardStep === 0 ? !!newAsstConfig.name.trim() : wizardStep === 1 ? !!newAsstConfig.instructions.trim() : true;
        return (
        <div className="fixed inset-0 bg-slate-50/60 dark:bg-slate-950/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[85vh]">
            {/* Header with step indicator */}
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50 shrink-0">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Create New Assistant</h2>
                <button onClick={() => { setShowAddModal(false); setWizardStep(0); setNewAsstImage(null); }} className="text-slate-500 hover:text-slate-600 dark:text-slate-400 rounded-lg p-1 hover:bg-slate-100 dark:hover:bg-slate-800"><X size={20} /></button>
              </div>
              {/* Step indicators */}
              <div className="flex items-center gap-1">
                {wizardSteps.map((s, i) => (
                  <React.Fragment key={i}>
                    <button 
                      onClick={() => { if (i < wizardStep) setWizardStep(i); }}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                        i === wizardStep 
                          ? 'bg-indigo-100 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 shadow-sm' 
                          : i < wizardStep 
                            ? 'text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 cursor-pointer' 
                            : 'text-slate-400 dark:text-slate-600 cursor-default'
                      }`}
                    >
                      {i < wizardStep ? <CheckCircle2 size={14} className="text-emerald-500" /> : s.icon}
                      <span className="hidden sm:inline">{s.label}</span>
                    </button>
                    {i < wizardSteps.length - 1 && (
                      <div className={`flex-1 h-px mx-1 ${i < wizardStep ? 'bg-emerald-300 dark:bg-emerald-600' : 'bg-slate-200 dark:bg-slate-700'}`} />
                    )}
                  </React.Fragment>
                ))}
              </div>
            </div>

            {/* Step Content */}
            <div className="flex-1 overflow-y-auto p-6">
              {/* STEP 0: Basics */}
              {wizardStep === 0 && (
                <div className="space-y-5 animate-in fade-in duration-200">
                  <div>
                    <h3 className="text-base font-semibold text-slate-900 dark:text-white mb-1">Basic Information</h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mb-5">Give your assistant an identity. The name is required, but a description helps you distinguish it later.</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Name <span className="text-red-500">*</span></label>
                    <input autoFocus type="text" value={newAsstConfig.name} onChange={e => setNewAsstConfig({ ...newAsstConfig, name: e.target.value })} placeholder="e.g. Legal Contract Reviewer" className="w-full px-4 py-2.5 border border-slate-300 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Description <span className="text-xs text-slate-400 font-normal">(optional)</span></label>
                    <textarea value={newAsstConfig.description} onChange={e => setNewAsstConfig({ ...newAsstConfig, description: e.target.value })} rows={3} placeholder="Briefly describe the assistant's purpose and expertise..." className="w-full px-4 py-2.5 border border-slate-300 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white text-sm leading-relaxed" />
                  </div>
                </div>
              )}

              {/* STEP 1: Instructions */}
              {wizardStep === 1 && (
                <div className="space-y-5 animate-in fade-in duration-200">
                  <div>
                    <h3 className="text-base font-semibold text-slate-900 dark:text-white mb-1">System Instructions</h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">Define how your assistant should behave. Choose a preset template or write your own.</p>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {instructionTemplates.map((t, i) => (
                      <button key={i} type="button" onClick={() => setNewAsstConfig({ ...newAsstConfig, instructions: t.value })} className={`text-left px-3 py-2.5 rounded-xl border text-xs font-medium transition-all flex items-center gap-2 ${
                        newAsstConfig.instructions === t.value
                          ? 'border-indigo-400 dark:border-indigo-500 bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 shadow-sm ring-1 ring-indigo-200 dark:ring-indigo-500/30'
                          : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                      }`}>
                        {t.icon} {t.label}
                      </button>
                    ))}
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Custom Instructions <span className="text-red-500">*</span></label>
                      <div className="relative">
                        <button type="button" onClick={() => setShowSnippets(showSnippets === 'create' ? null : 'create')} className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1"><Plus size={12}/> Insert snippet</button>
                        {showSnippets === 'create' && (
                          <div className="absolute right-0 top-full mt-1 w-72 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg py-1 z-50 text-sm">
                            {SNIPPETS.map((sn, i) => (
                              <button key={i} type="button" onClick={() => { setNewAsstConfig(c => ({ ...c, instructions: (c.instructions ? c.instructions + '\n\n' : '') + sn.text })); setShowSnippets(null); }} className="w-full text-left px-3 py-2 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300">
                                <div className="font-medium text-xs text-slate-900 dark:text-white">{sn.label}</div>
                                <div className="text-[11px] text-slate-500 truncate">{sn.text}</div>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    <textarea value={newAsstConfig.instructions} onChange={e => setNewAsstConfig({ ...newAsstConfig, instructions: e.target.value })} rows={6} className="w-full px-4 py-3 border border-slate-300 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 font-mono text-sm leading-relaxed bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white" />
                  </div>
                </div>
              )}

              {/* STEP 2: Avatar */}
              {wizardStep === 2 && (
                <div className="space-y-5 animate-in fade-in duration-200">
                  <div>
                    <h3 className="text-base font-semibold text-slate-900 dark:text-white mb-1">Avatar</h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mb-5">Upload an image to personalize your assistant. You can also generate an AI avatar after creation from the edit panel.</p>
                  </div>
                  <div className="flex flex-col items-center gap-4">
                    <div className="w-28 h-28 rounded-2xl overflow-hidden bg-slate-100 dark:bg-slate-800 flex items-center justify-center border-2 border-dashed border-slate-300 dark:border-slate-600">
                      {newAsstImage ? (
                        <img src={URL.createObjectURL(newAsstImage)} alt="Preview" className="w-full h-full object-cover cursor-pointer hover:opacity-80 transition-opacity" onClick={() => setPreviewImageUrl(URL.createObjectURL(newAsstImage))} />
                      ) : (
                        <Bot size={40} className="text-slate-400" />
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <input type="file" ref={newAvatarInputRef} accept="image/*" className="hidden" onChange={e => { if (e.target.files?.[0]) setNewAsstImage(e.target.files[0]); }} />
                      <button type="button" onClick={() => newAvatarInputRef.current?.click()} className="px-4 py-2 text-sm font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition-colors flex items-center gap-2">
                        <ImageIcon size={16} /> Upload Image
                      </button>
                      {newAsstImage && (
                        <button type="button" onClick={() => setNewAsstImage(null)} className="px-4 py-2 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-xl transition-colors">
                          Remove
                        </button>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 text-center">AI avatar generation will be available after creation.</p>
                  </div>
                </div>
              )}

              {/* STEP 3: Review */}
              {wizardStep === 3 && (
                <div className="space-y-5 animate-in fade-in duration-200">
                  <div>
                    <h3 className="text-base font-semibold text-slate-900 dark:text-white mb-1">Review & Create</h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mb-5">Verify your assistant's configuration before launching.</p>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800 divide-y divide-slate-200 dark:divide-slate-800">
                    <div className="flex items-center gap-4 p-4">
                      <div className="w-14 h-14 rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0 border border-slate-200 dark:border-slate-700">
                        {newAsstImage ? (
                          <img src={URL.createObjectURL(newAsstImage)} alt="Avatar" className="w-full h-full object-cover" />
                        ) : (
                          <Bot size={24} className="text-slate-400" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <h4 className="text-base font-semibold text-slate-900 dark:text-white truncate">{newAsstConfig.name}</h4>
                        <p className="text-sm text-slate-500 dark:text-slate-400 truncate">{newAsstConfig.description || 'No description'}</p>
                      </div>
                      <button type="button" onClick={() => setWizardStep(0)} className="ml-auto text-xs text-indigo-600 dark:text-indigo-400 hover:underline shrink-0">Edit</button>
                    </div>
                    <div className="p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">System Instructions</span>
                        <button type="button" onClick={() => setWizardStep(1)} className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline">Edit</button>
                      </div>
                      <pre className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap font-mono leading-relaxed bg-white dark:bg-slate-900 rounded-lg p-3 border border-slate-100 dark:border-slate-800 max-h-40 overflow-y-auto">{newAsstConfig.instructions}</pre>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Footer with navigation */}
            <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50 flex items-center justify-between shrink-0">
              <button type="button" onClick={() => { if (wizardStep === 0) { setShowAddModal(false); setWizardStep(0); setNewAsstImage(null); } else setWizardStep(wizardStep - 1); }} className="px-4 py-2.5 text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition-colors flex items-center gap-1.5">
                <ChevronLeft size={16} /> {wizardStep === 0 ? 'Cancel' : 'Back'}
              </button>
              {wizardStep < 3 ? (
                <button type="button" disabled={!canProceed} onClick={() => setWizardStep(wizardStep + 1)} className="px-5 py-2.5 text-sm font-medium bg-indigo-600 text-white rounded-xl hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm transition-all flex items-center gap-1.5">
                  Next <ChevronRight size={16} />
                </button>
              ) : (
                <button type="button" onClick={(e) => handleCreateAssistant(e)} disabled={!newAsstConfig.name || !newAsstConfig.instructions} className="px-5 py-2.5 text-sm font-medium bg-emerald-600 text-white rounded-xl hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm transition-all flex items-center gap-1.5">
                  <Zap size={16} /> Launch Assistant
                </button>
              )}
            </div>
          </div>
        </div>
        );
      })()}

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

      {showCancelAvatarModal && (
        <div className="fixed inset-0 bg-slate-900/40 dark:bg-slate-950/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-md shadow-2xl border border-slate-200 dark:border-slate-800 p-6">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">Avatar is generating</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-6 leading-relaxed">
              An avatar is currently being generated. What would you like to do?
            </p>
            <div className="flex flex-col gap-3">
              <button
                onClick={() => {
                  abortControllerRef.current?.abort();
                  setShowCancelAvatarModal(false);
                  setShowEditModal(false);
                }}
                className="w-full px-4 py-2.5 bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-500/20 rounded-lg font-medium text-sm transition-colors text-left flex items-center"
              >
                Cancel generation entirely
              </button>
              <button
                onClick={() => {
                  setShowCancelAvatarModal(false);
                  setShowEditModal(false);
                }}
                className="w-full px-4 py-2.5 bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg font-medium text-sm transition-colors text-left"
              >
                Continue generation in background
              </button>
              <button
                onClick={() => setShowCancelAvatarModal(false)}
                className="w-full px-4 py-2.5 bg-indigo-600 text-white hover:bg-indigo-500 rounded-lg font-medium text-sm transition-colors text-center mt-2"
              >
                Resume waiting
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SAVE WHILE GENERATING MODAL */}
      {showSaveWhileGeneratingModal && (
        <div className="fixed inset-0 bg-slate-900/40 dark:bg-slate-950/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-sm shadow-2xl border border-slate-200 dark:border-slate-800 p-6 text-center">
            <Loader2 size={40} className="mx-auto text-indigo-500 animate-spin mb-4" />
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">Generation Running</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-6 leading-relaxed">
              An avatar is currently generating. Please wait for it to complete or cancel it before saving your changes.
            </p>
            <button
              onClick={() => setShowSaveWhileGeneratingModal(false)}
              className="w-full px-4 py-2.5 bg-indigo-600 text-white hover:bg-indigo-500 rounded-lg font-medium text-sm transition-colors"
            >
              Go Back
            </button>
          </div>
        </div>
      )}

      {/* DOCUMENT FILE PREVIEWER MODAL */}
      {previewDoc && (
        <div className="fixed inset-0 bg-slate-900/60 dark:bg-slate-950/70 backdrop-blur-sm z-[250] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-4xl max-h-[90vh] shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden">
            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-950/50 shrink-0">
              <div className="flex items-center gap-3 overflow-hidden">
                <div className="p-2 bg-indigo-50 dark:bg-indigo-500/10 rounded-lg">
                  <FileText size={18} className="text-indigo-500" />
                </div>
                <div className="overflow-hidden">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white truncate">{previewDoc.filename}</h3>
                  <span className="text-xs text-slate-500 uppercase tracking-wider">{previewDoc.filename.split('.').pop()?.toUpperCase()} File</span>
                </div>
              </div>
              <button onClick={closePreview} className="text-slate-500 hover:text-slate-600 dark:text-slate-400 rounded-lg p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                <X size={20} />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-auto">
              {previewLoading ? (
                <div className="flex items-center justify-center h-64">
                  <div className="flex flex-col items-center gap-3">
                    <Loader2 size={32} className="animate-spin text-indigo-500" />
                    <span className="text-sm text-slate-500">Loading preview...</span>
                  </div>
                </div>
              ) : previewContent?.type === 'error' ? (
                <div className="flex items-center justify-center h-64">
                  <div className="flex flex-col items-center gap-3 text-center">
                    <AlertCircle size={32} className="text-red-400" />
                    <span className="text-sm text-slate-600 dark:text-slate-400">{previewContent.content}</span>
                  </div>
                </div>
              ) : previewContent?.type === 'md' ? (
                <div className="p-6 md:p-8 prose dark:prose-invert prose-slate max-w-none prose-p:leading-relaxed prose-pre:bg-slate-50 dark:prose-pre:bg-slate-950 prose-pre:border prose-pre:border-slate-200 dark:prose-pre:border-slate-800 prose-code:text-indigo-600 dark:prose-code:text-indigo-300 prose-headings:text-slate-900 dark:prose-headings:text-white">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {previewContent.content || ''}
                  </ReactMarkdown>
                </div>
              ) : previewContent?.type === 'csv' ? (
                <div className="p-6 overflow-x-auto">
                  <table className="w-full text-sm border-collapse">
                    {previewContent.content?.split('\n').filter(Boolean).map((row, i) => (
                      <tr key={i} className={i === 0 ? 'bg-slate-100 dark:bg-slate-800 font-semibold' : 'border-t border-slate-200 dark:border-slate-800'}>
                        {row.split(',').map((cell, j) => (
                          i === 0
                            ? <th key={j} className="px-4 py-2.5 text-left text-xs uppercase tracking-wider text-slate-600 dark:text-slate-400">{cell.trim()}</th>
                            : <td key={j} className="px-4 py-2.5 text-slate-700 dark:text-slate-300">{cell.trim()}</td>
                        ))}
                      </tr>
                    ))}
                  </table>
                </div>
              ) : previewContent?.type === 'pdf' ? (
                <iframe src={previewContent.blobUrl} className="w-full h-[75vh]" title="PDF Preview" />
              ) : previewContent?.type === 'image' ? (
                <div className="flex items-center justify-center p-8 bg-slate-50 dark:bg-slate-950">
                  <img src={previewContent.blobUrl} alt={previewContent.filename} className="max-w-full max-h-[70vh] object-contain rounded-lg shadow-lg" />
                </div>
              ) : previewContent ? (
                <div className="p-6">
                  <div className="bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800 p-5 overflow-auto max-h-[65vh]">
                    <pre className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap font-mono leading-relaxed break-words">{previewContent.content}</pre>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {/* ENLARGED IMAGE PREVIEW MODAL */}
      {previewImageUrl && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-[300] flex items-center justify-center p-4" onClick={() => setPreviewImageUrl(null)}>
          <div className="relative max-w-2xl w-full flex items-center justify-center">
            <button onClick={() => setPreviewImageUrl(null)} className="absolute -top-12 right-0 text-white hover:text-slate-300 p-2"><X size={28} /></button>
            <img src={previewImageUrl} alt="Enlarged Avatar" className="w-full max-w-sm md:max-w-md h-auto rounded-2xl shadow-2xl object-cover" onClick={(e) => e.stopPropagation()} />
          </div>
        </div>
      )}

      {/* CHAT SEARCH OVERLAY */}
      {chatSearchOpen && selectedSession && (
        <div className="fixed inset-0 bg-slate-900/40 dark:bg-slate-950/60 backdrop-blur-sm z-[260] flex items-start justify-center p-4 pt-24" onClick={() => setChatSearchOpen(false)}>
          <div className="bg-white dark:bg-slate-900 w-full max-w-xl rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center px-4 py-3 border-b border-slate-200 dark:border-slate-800">
              <Search size={16} className="text-slate-400 mr-2" />
              <input
                ref={chatSearchInputRef}
                value={chatSearchQuery}
                onChange={(e) => { setChatSearchQuery(e.target.value); runChatSearch(e.target.value); }}
                placeholder="Search this conversation..."
                className="flex-1 bg-transparent outline-none text-sm text-slate-900 dark:text-white placeholder-slate-400"
              />
              <button onClick={() => setChatSearchOpen(false)} className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded"><X size={16}/></button>
            </div>
            <div className="max-h-[60vh] overflow-y-auto">
              {chatSearchQuery.trim() === '' ? (
                <div className="p-6 text-center text-sm text-slate-500">Type to search messages in this chat.</div>
              ) : chatSearchResults.length === 0 ? (
                <div className="p-6 text-center text-sm text-slate-500">No matches.</div>
              ) : (
                <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                  {chatSearchResults.map(r => (
                    <li key={r.id} className="px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/60">
                      <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-400 mb-1">{r.role === 'user' ? 'You' : selectedAssistant?.name || 'Assistant'} · {r.created_at ? new Date(r.created_at).toLocaleString() : ''}</div>
                      <div className="text-sm text-slate-700 dark:text-slate-300 line-clamp-3 whitespace-pre-wrap">{r.content}</div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ANIMATED TOAST NOTIFICATION */}
      {toastConfig && (
        <div className="fixed bottom-6 right-6 z-[400] animate-in slide-in-from-bottom-5 fade-in duration-300">
          <div className={`px-5 py-4 rounded-xl shadow-xl flex items-center gap-3 border ${toastConfig.type === 'success'
            ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/20 text-emerald-800 dark:text-emerald-400'
            : toastConfig.type === 'error'
              ? 'bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/20 text-red-800 dark:text-red-400'
              : 'bg-slate-50 dark:bg-slate-800/80 border-slate-200 dark:border-slate-700/50 text-slate-700 dark:text-slate-300'
            }`}>
            {toastConfig.type === 'success' ? (
              <CheckCircle2 size={24} className="text-emerald-500 shrink-0" />
            ) : toastConfig.type === 'error' ? (
              <AlertCircle size={24} className="text-red-500 shrink-0" />
            ) : (
              <Info size={24} className="text-slate-500 dark:text-slate-400 shrink-0" />
            )}
            <div className="flex flex-col">
              <span className="font-semibold text-sm">
                {toastConfig.title}
              </span>
              <span className={`text-xs mt-0.5 ${toastConfig.type === 'success'
                ? 'text-emerald-600/80 dark:text-emerald-400/80'
                : toastConfig.type === 'error'
                  ? 'text-red-600/80 dark:text-red-400/80'
                  : 'text-slate-500 dark:text-slate-400'
                }`}>
                {toastConfig.description}
              </span>
            </div>
            {toastConfig.action && (
              <button 
                onClick={() => { toastConfig.action!.onClick(); setToastConfig(null); }}
                className={`ml-2 px-3 py-1.5 text-xs font-semibold rounded-lg shadow-sm border transition-colors ${
                  toastConfig.type === 'success' 
                    ? 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/30 hover:bg-emerald-200 dark:hover:bg-emerald-500/30' 
                    : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700'
                }`}
              >
                {toastConfig.action.label}
              </button>
            )}
            <button onClick={() => setToastConfig(null)} className="ml-2 p-1 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
              <X size={16} className={toastConfig.type === 'success' ? 'text-emerald-600 dark:text-emerald-500' : toastConfig.type === 'error' ? 'text-red-600 dark:text-red-500' : 'text-slate-400'} />
            </button>
          </div>
        </div>
      )}

    </div>
  );
}