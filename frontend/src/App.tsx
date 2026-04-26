import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Send, Upload, Trash2, Loader2, FileText, Menu, X, Plus, BookOpen, MessageSquare, Settings, AlertCircle, Bot, Edit2, ChevronLeft, ChevronRight, Sun, Moon, PanelLeftClose, PanelLeftOpen, Zap, Sparkles, ImageIcon, ArrowDown, CheckCircle2, Info, Eye, Check, Briefcase, GraduationCap, Code, HeartPulse, Scale, ShieldCheck, Lightbulb, ThumbsUp, ThumbsDown, RotateCcw, Search, Pin, GitBranch, Download, Copy, GripVertical, MoreHorizontal, Quote, Globe, Folder, Github, ChevronDown, Cpu, Home, Eraser } from 'lucide-react';
import { useT } from './i18n';
import logo from './assets/logo.png';

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
  message_count?: number;
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
  context?: string[];
  feedback?: number | null;
  created_at?: string;
  streaming?: boolean;
}

interface AppStats {
  assistants: number;
  documents: number;
  sessions: number;
}

interface RecentSession {
  id: string;
  title: string;
  updated_at: string | null;
  assistant_id: string;
  assistant_name: string;
  assistant_image_url: string | null;
  message_count?: number;
}

const SNIPPETS: { key: string; text: string; searchTerms: string[] }[] = [
  { key: 'snippet.noHallucination', text: 'If the context does not contain the answer, state clearly that you do not know based on the provided documents.', searchTerms: ['hallucina', 'not in the context', 'do not know', 'no invent'] },
  { key: 'snippet.stepByStep', text: 'Walk through your reasoning step-by-step before stating the final answer.', searchTerms: ['step-by-step', 'paso a paso', 'reasoning', 'razonamiento'] },
  { key: 'snippet.concise', text: 'Keep answers concise. Avoid filler words and redundant restatements of the question.', searchTerms: ['concise', 'conciso', 'short', 'corto', 'no filler'] },
  { key: 'snippet.formal', text: 'Maintain a formal, professional tone. Avoid colloquialisms and emojis.', searchTerms: ['formal', 'professional', 'profesional', 'emoji'] },
  { key: 'snippet.markdown', text: 'Format answers using Markdown: bullet lists for enumerations, fenced code blocks for code, tables where data is comparative.', searchTerms: ['markdown', 'bullet', 'lista', 'table', 'tabla', 'code block'] },
  { key: 'snippet.refuseOutOfScope', text: 'If the user asks about topics unrelated to the provided documents, politely decline and steer back to the documents.', searchTerms: ['out-of-scope', 'fuera de contexto', 'unrelated', 'decline', 'rechaza'] },
];

const INSTRUCTION_TEMPLATES: { key: string; instructions: string }[] = [
  { key: 'template.general', instructions: 'You are a helpful AI assistant. Answer based only on the provided context.' },
  { key: 'template.legal', instructions: 'You are a legal analysis assistant. Provide precise, citation-backed legal interpretations based only on the provided documents. Always clarify that your analysis is informational, not legal advice.' },
  { key: 'template.code', instructions: 'You are a senior code reviewer. Analyze code snippets and documents for bugs, security vulnerabilities, and best-practice violations. Provide actionable suggestions with corrected code examples.' },
  { key: 'template.medical', instructions: 'You are a medical research assistant. Summarize clinical findings, compare study methodologies, and extract key data points from provided medical documents. Always note limitations and recommend professional consultation.' },
  { key: 'template.tutor', instructions: 'You are an academic tutor. Explain concepts from the provided materials in clear, simple language. Use examples, analogies, and step-by-step breakdowns. Ask follow-up questions to check understanding.' },
  { key: 'template.compliance', instructions: 'You are a compliance and policy auditor. Analyze provided documents against regulatory frameworks and internal policies. Flag non-compliant sections, assess risk levels, and suggest remediation steps.' },
];

function HighlightedText({ text, highlight, isMarkdown = false }: { text: string; highlight?: string; isMarkdown?: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (highlight && containerRef.current) {
      const timer = setTimeout(() => {
        const mark = containerRef.current?.querySelector('mark');
        if (mark) {
          mark.scrollIntoView({ behavior: 'smooth', block: 'center' });
          mark.classList.add('ring-4', 'ring-yellow-400/50', 'scale-105', 'transition-all', 'duration-500');
          setTimeout(() => {
            if (mark) mark.classList.remove('ring-4', 'ring-yellow-400/50', 'scale-105');
          }, 2000);
        }
      }, 600);
      return () => clearTimeout(timer);
    }
  }, [highlight, text]);

  if (!highlight) {
    if (isMarkdown) return <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>;
    return <pre className="whitespace-pre-wrap font-mono text-sm leading-relaxed">{text}</pre>;
  }

  // Sort snippets by length (longest first) to avoid partial matches when one is a substring of another
  const highlightParts = highlight.split('\n\n---\n\n').filter(Boolean).sort((a, b) => b.length - a.length);

  const wrapMatches = (input: string): (string | React.ReactElement)[] => {
    if (!input) return [];
    let parts: (string | React.ReactElement)[] = [input];

    highlightParts.forEach(h => {
      const escaped = h.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`(${escaped})`, 'gi');

      const newParts: (string | React.ReactElement)[] = [];
      parts.forEach(p => {
        if (typeof p === 'string') {
          const split = p.split(regex);
          split.forEach(s => {
            if (s.toLowerCase() === h.toLowerCase()) {
              newParts.push(<mark className="bg-yellow-200 dark:bg-yellow-400/40 text-slate-900 dark:text-white rounded px-0.5 font-medium shadow-sm border-b border-yellow-400/50">{s}</mark>);
            } else {
              newParts.push(s);
            }
          });
        } else {
          newParts.push(p);
        }
      });
      parts = newParts;
    });
    return parts;
  };

  if (isMarkdown) {
    return (
      <div ref={containerRef} className="grounded-preview-container">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            // Custom renderer for text nodes to inject highlights
            text: (props) => {
              const parts = wrapMatches(String(props.children));
              return <>{parts.map((p, i) => <React.Fragment key={i}>{p}</React.Fragment>)}</>;
            }
          }}
        >
          {text}
        </ReactMarkdown>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="grounded-preview-container">
      <pre className="whitespace-pre-wrap font-mono text-sm leading-relaxed">
        {wrapMatches(text)}
      </pre>
    </div>
  );
}

export default function App() {
  const { t, lang, setLang } = useT();

  const [assistants, setAssistants] = useState<Assistant[]>([]);
  const [selectedAssistant, setSelectedAssistant] = useState<Assistant | null>(null);

  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [selectedSession, setSelectedSession] = useState<ChatSession | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);

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
  const [sessionToClear, setSessionToClear] = useState<ChatSession | null>(null);
  const [documentToDelete, setDocumentToDelete] = useState<Document | null>(null);
  const [newAsstConfig, setNewAsstConfig] = useState({ name: '', description: '', instructions: 'You are a helpful AI assistant. Answer based only on the provided context.' });
  const [editAsstConfig, setEditAsstConfig] = useState({ id: '', name: '', description: '', instructions: '', image_url: '' });
  const [isDragging, setIsDragging] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');
  const [showChatsPane, setShowChatsPane] = useState(true);
  const [newAsstImage, setNewAsstImage] = useState<File | null>(null);
  const [pendingDocs, setPendingDocs] = useState<File[]>([]);
  const [wizardDragOver, setWizardDragOver] = useState(false);
  const [creationProgress, setCreationProgress] = useState<{ current: number; total: number } | null>(null);
  const [editAsstImage, setEditAsstImage] = useState<File | null>(null);
  const [removeEditImage, setRemoveEditImage] = useState(false);
  const [generatingAssistantId, setGeneratingAssistantId] = useState<string | null>(null);
  const [showCancelAvatarModal, setShowCancelAvatarModal] = useState(false);
  const [showSaveWhileGeneratingModal, setShowSaveWhileGeneratingModal] = useState(false);
  const [generationTime, setGenerationTime] = useState(0);
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const [isFormatting, setIsFormatting] = useState(false);

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

  const [editAsstImageUrl, setEditAsstImageUrl] = useState<string | null>(null);
  const [newAsstImageUrl, setNewAsstImageUrl] = useState<string | null>(null);

  // Refs to avoid stale closures in long-running async tasks
  const pendingEditsRef = useRef(pendingEdits);
  const editAsstConfigRef = useRef(editAsstConfig);
  const assistantsRef = useRef(assistants);

  useEffect(() => { pendingEditsRef.current = pendingEdits; }, [pendingEdits]);
  useEffect(() => { editAsstConfigRef.current = editAsstConfig; }, [editAsstConfig]);
  useEffect(() => { assistantsRef.current = assistants; }, [assistants]);

  // Manage Blob URLs to avoid memory leaks and flickering
  useEffect(() => {
    if (editAsstImage) {
      const url = (editAsstImage as any).tempUrl || URL.createObjectURL(editAsstImage);
      setEditAsstImageUrl(url);
      return () => { if (!(editAsstImage as any).tempUrl) URL.revokeObjectURL(url); };
    }
    setEditAsstImageUrl(null);
  }, [editAsstImage]);

  useEffect(() => {
    if (newAsstImage) {
      const url = URL.createObjectURL(newAsstImage);
      setNewAsstImageUrl(url);
      return () => URL.revokeObjectURL(url);
    }
    setNewAsstImageUrl(null);
  }, [newAsstImage]);

  const showToast = (type: 'success' | 'info' | 'error', title: string, description: string, action?: { label: string, onClick: () => void }) => {
    setToastConfig({ type, title, description, action });
    setTimeout(() => setToastConfig(null), action ? 8000 : 3000);
  };

  const [showScrollButton, setShowScrollButton] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<{ id: string, filename: string } | null>(null);
  const [showAssistantDetails, setShowAssistantDetails] = useState(false);
  const [previewContent, setPreviewContent] = useState<{ type: string, filename: string, content?: string, blobUrl?: string, highlightText?: string } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  // New feature state
  const [renamingSessionId, setRenamingSessionId] = useState<string | null>(null);
  const [renamingDraft, setRenamingDraft] = useState('');
  const [chatSearchOpen, setChatSearchOpen] = useState(false);
  const [chatSearchQuery, setChatSearchQuery] = useState('');
  const [chatSearchResults, setChatSearchResults] = useState<any[]>([]);
  const [loadingDots, setLoadingDots] = useState('.');
  const [isRegenerating, setIsRegenerating] = useState(false);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  // Loading dots animation
  useEffect(() => {
    const interval = setInterval(() => {
      setLoadingDots(prev => {
        if (prev === '...') return '.';
        if (prev === '..') return '...';
        return '..';
      });
    }, 500);
    return () => clearInterval(interval);
  }, []);

  // Auto-scroll effect
  useEffect(() => {
    if (isAutoScrollingRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
    }
  }, [messages]);

  const [showSnippets, setShowSnippets] = useState<'edit' | 'create' | null>(null);
  const [draggingAssistantId, setDraggingAssistantId] = useState<string | null>(null);
  const [dragOverAssistantId, setDragOverAssistantId] = useState<string | null>(null);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [assistantMenuOpen, setAssistantMenuOpen] = useState<string | null>(null);

  // Homepage extras
  const [homeSearch, setHomeSearch] = useState('');
  const [homeSort, setHomeSort] = useState<'default' | 'alpha' | 'recent'>('default');
  const [stats, setStats] = useState<AppStats | null>(null);
  const [recentSessions, setRecentSessions] = useState<RecentSession[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [showImportInfo, setShowImportInfo] = useState(false);
  const streamAbortRef = useRef<AbortController | null>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const chatSearchInputRef = useRef<HTMLInputElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const wizardDocInputRef = useRef<HTMLInputElement>(null);
  const newAvatarInputRef = useRef<HTMLInputElement>(null);
  const editAvatarInputRef = useRef<HTMLInputElement>(null);
  const isAutoScrollingRef = useRef(false);
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Initialization
  useEffect(() => {
    fetchAssistants();
    fetchStats();
    fetchRecentSessions();
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

  // Update when session selected - ONLY on ID change
  useEffect(() => {
    if (selectedSession?.id) {
      fetchHistory(selectedSession.id);
    }
  }, [selectedSession?.id]);

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

  // Click outside to close menus
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (showExportMenu && !target.closest('.export-menu-container')) setShowExportMenu(false);
      if (showSnippets && !target.closest('.snippets-menu-container')) setShowSnippets(null);
      if (assistantMenuOpen && !target.closest('.assistant-menu-container')) setAssistantMenuOpen(null);
      if (previewDoc && !target.closest('.preview-modal-content')) closePreview();
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showExportMenu, showSnippets, assistantMenuOpen, previewDoc]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    const isNearBottom = scrollHeight - scrollTop - clientHeight < 150;

    if (isAutoScrollingRef.current) {
      // During auto-scroll, we always hide the button and extend the auto-scroll state
      setShowScrollButton(false);
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
      scrollTimeoutRef.current = setTimeout(() => {
        isAutoScrollingRef.current = false;
      }, 500);
      return;
    }

    setShowScrollButton(!isNearBottom);
  };

  const scrollToBottom = () => {
    isAutoScrollingRef.current = true;
    setShowScrollButton(false);
    if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
    scrollTimeoutRef.current = setTimeout(() => { isAutoScrollingRef.current = false; }, 1000);
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

  const fetchStats = async () => {
    try {
      const res = await fetch('/api/stats');
      if (res.ok) setStats(await res.json());
    } catch { /* non-fatal */ }
  };

  const fetchRecentSessions = async () => {
    try {
      const res = await fetch('/api/sessions/recent?limit=5');
      if (res.ok) setRecentSessions(await res.json());
    } catch { /* non-fatal */ }
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
      if (!res.ok) throw new Error();
      const created = await res.json();

      const docsToUpload = [...pendingDocs];
      setShowAddModal(false);
      setWizardStep(0);
      setNewAsstConfig({ name: '', description: '', instructions: 'You are a helpful AI assistant. Answer based only on the provided context.' });
      setNewAsstImage(null);
      setPendingDocs([]);

      if (docsToUpload.length === 0) {
        fetchAssistants(); fetchStats(); fetchRecentSessions();
        showToast('success', t('toast.assistant.created'), t('toast.assistant.created.msg', { name: created.name }));
        return;
      }

      setCreationProgress({ current: 0, total: docsToUpload.length });
      let failed = 0;
      let completed = 0;
      
      await Promise.all(docsToUpload.map(async (file) => {
        const fd = new FormData();
        fd.append('file', file);
        try {
          const r = await fetch(`/api/assistants/${created.id}/documents/`, { method: 'POST', body: fd });
          if (!r.ok) failed++;
        } catch {
          failed++;
        } finally {
          completed++;
          setCreationProgress({ current: completed, total: docsToUpload.length });
        }
      }));

      setCreationProgress(null);
      fetchAssistants(); fetchStats(); fetchRecentSessions();

      if (failed === 0) {
        showToast('success', t('toast.assistant.created'), t('toast.assistant.created.docs', { name: created.name, n: docsToUpload.length, s: docsToUpload.length > 1 ? 's' : '' }));
      } else {
        showToast('info', t('toast.assistant.created'), t('toast.assistant.created.warn', { name: created.name, n: failed, s: failed > 1 ? 's' : '' }));
      }
    } catch (e) {
      console.error(e);
      showToast('error', t('toast.err.creation'), t('toast.err.creation.msg'));
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
      showToast('info', t('toast.assistant.noChanges'), t('toast.assistant.noChanges.msg'));
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
        showToast('success', t('toast.assistant.saved'), t('toast.assistant.saved.msg'));
      }
    } catch (e) {
      console.error(e);
      showToast('error', t('toast.err.update'), t('toast.err.update.msg'));
    }
  };

  const handleEditAssistantClick = (assistant: Assistant, e?: React.MouseEvent) => {
    e?.stopPropagation();

    // Restore any pending edits for this assistant if they exist (using ref to avoid stale closures)
    const currentPending = pendingEditsRef.current;
    if (currentPending[assistant.id]) {
      setEditAsstConfig(currentPending[assistant.id].config);
      setEditAsstImage(currentPending[assistant.id].imageFile);
      setRemoveEditImage(currentPending[assistant.id].removeImage);
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

  const handlePreviewDocument = async (doc: { id: string; filename: string }, highlightText?: string) => {
    setPreviewDoc(doc);
    setPreviewLoading(true);
    setPreviewContent(null);
    const ext = doc.filename.split('.').pop()?.toLowerCase() || '';
    try {
      const res = await fetch(`/api/documents/${doc.id}/preview`);

      if (!res.ok) throw new Error('Failed to load preview');
      if (['md', 'txt', 'csv', 'docx', 'pptx'].includes(ext)) {
        const data = await res.json();
        setPreviewContent({ type: data.type, filename: data.filename, content: data.content, highlightText });
      } else if (ext === 'pdf') {
        const blob = await res.blob();
        setPreviewContent({ type: 'pdf', filename: doc.filename, blobUrl: URL.createObjectURL(blob), highlightText });
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
      showToast('error', t('toast.avatar.inProgress'), t('toast.avatar.inProgress.msg'));
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

        setPendingEdits(prev => {
          const baseConfig = prev[assistantId]?.config || 
                             (editAsstConfigRef.current.id === assistantId ? editAsstConfigRef.current : null) ||
                             assistantsRef.current.find(a => a.id === assistantId) || 
                             editAsstConfigRef.current; // Last resort fallback

          return {
            ...prev,
            [assistantId]: {
              config: {
                id: baseConfig.id || assistantId,
                name: baseConfig.name || '',
                description: baseConfig.description || '',
                instructions: baseConfig.instructions || '',
                image_url: baseConfig.image_url || ''
              },
              imageFile: file,
              removeImage: false
            }
          };
        });

        setEditAsstImage(prev => {
          // Only update the live modal if they are still looking at the same assistant
          if (editAsstConfigRef.current.id === assistantId) {
            setRemoveEditImage(false);
            return file;
          }
          return prev;
        });

        showToast('success', t('toast.avatar.complete'), t('toast.avatar.complete.msg'), {
          label: t('toast.avatar.review'),
          onClick: () => {
            const assistant = assistantsRef.current.find(a => a.id === assistantId);
            if (assistant) handleEditAssistantClick(assistant);
          }
        });
      } else {
        const err = await res.json();
        showToast('error', t('toast.avatar.failed'), err.detail || t('toast.avatar.failed.msg'));
      }
    } catch (e: any) {
      if (e.name === 'AbortError') {
        console.log('Avatar generation aborted by user.');
        return;
      }
      console.error(e);
      showToast('error', t('toast.avatar.failed'), t('toast.avatar.failed.msg'));
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
        fetchAssistants(); fetchStats(); fetchRecentSessions();
        showToast('success', t('toast.assistant.deleted'), t('toast.assistant.deleted.msg', { name: assistantToDelete.name }));
      }
    } catch (e) {
      console.error(e);
      showToast('error', t('toast.err.delete'), t('toast.err.delete.msg'));
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
        showToast('success', t('toast.chat.deleted'), t('toast.chat.deleted.msg'));
      }
    } catch (e) {
      console.error(e);
      showToast('error', t('toast.chat.deleteFailed'), t('toast.chat.deleteFailed.msg'));
    }
    setSessionToDelete(null);
  };

  const handleFormatInstructions = async (type: 'wizard' | 'edit') => {
    const instructions = type === 'wizard' ? newAsstConfig.instructions : editAsstConfig.instructions;
    if (!instructions.trim()) return;

    setIsFormatting(true);
    try {
      const res = await fetch('/api/format-instructions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instructions })
      });
      if (res.ok) {
        const data = await res.json();
        if (type === 'wizard') {
          setNewAsstConfig(prev => ({ ...prev, instructions: data.formatted }));
        } else {
          setEditAsstConfig(prev => ({ ...prev, instructions: data.formatted }));
        }
        showToast('success', t('toast.assistant.saved'), 'Prompt optimized successfully.');
      } else {
        showToast('error', 'Formatting Failed', 'Could not optimize instructions.');
      }
    } catch (e) {
      console.error("Formatting failed", e);
      showToast('error', 'Formatting Failed', 'Network error.');
    } finally {
      setIsFormatting(false);
    }
  };

  const confirmClearSession = async () => {
    if (!sessionToClear) return;
    try {
      const res = await fetch(`/api/sessions/${sessionToClear.id}/messages`, { method: 'DELETE' });
      if (res.ok) {
        if (selectedSession?.id === sessionToClear.id) setMessages([]);
        setSessions(prev => prev.map(s => s.id === sessionToClear.id ? { ...s, message_count: 0 } : s));
        if (selectedAssistant) fetchSessions(selectedAssistant.id);
        showToast('success', t('toast.chat.cleared'), t('toast.chat.cleared.msg'));
      } else {
        showToast('error', t('toast.chat.clearFailed'), t('toast.chat.clearFailed.msg'));
      }
    } catch (e) {
      console.error(e);
      showToast('error', t('toast.chat.clearFailed'), t('toast.chat.clearFailed.msg'));
    }
    setSessionToClear(null);
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
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
      scrollTimeoutRef.current = setTimeout(() => { isAutoScrollingRef.current = false; }, 1500);

      // Animation: scroll from top to bottom
      setTimeout(() => {
        if (chatScrollRef.current) {
          chatScrollRef.current.scrollTop = 0;
          setTimeout(() => {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
          }, 100);
        }
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
    setCreationProgress({ current: 0, total: files.length });

    let failed = 0;
    let completed = 0;

    await Promise.all(files.map(async (file) => {
      const formData = new FormData();
      formData.append('file', file);
      try {
        const res = await fetch(`/api/assistants/${selectedAssistant.id}/documents/`, { method: 'POST', body: formData });
        if (!res.ok) failed++;
      } catch (err) {
        failed++;
      } finally {
        completed++;
        setCreationProgress({ current: completed, total: files.length });
      }
    }));

    setCreationProgress(null);
    setUploading(false);
    fetchDocuments(selectedAssistant.id);
    if (fileInputRef.current) fileInputRef.current.value = '';
    
    if (failed === 0) {
      showToast('success', t('toast.docs.uploaded'), t('toast.docs.uploaded.msg'));
    } else {
      showToast('info', t('toast.docs.uploaded'), t('toast.docs.uploaded.warn', { n: failed, s: failed > 1 ? 's' : '' }));
    }
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
        showToast('success', t('toast.docs.deleted'), t('toast.docs.deleted.msg', { filename: documentToDelete.filename }));
      }
    } catch (e) {
      console.error(e);
      showToast('error', t('toast.docs.deleteFailed'), t('toast.docs.deleteFailed.msg'));
    }
    setDocumentToDelete(null);
  };

  const consumeStream = async (
    sessionId: string,
    body: object,
    endpoint: 'chat/stream' | 'regenerate/stream'
  ): Promise<void> => {
    streamAbortRef.current?.abort();
    streamAbortRef.current = new AbortController();

    const streamId = `stream-${Date.now()}`;
    setMessages(prev => [
      ...prev.filter(m => !m.streaming), // Ensure no stale streaming messages
      { id: streamId as any, role: 'assistant', content: '', streaming: true, created_at: new Date().toISOString() }
    ]);

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
                isAutoScrollingRef.current = true;
                setShowScrollButton(false);
                if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
                scrollTimeoutRef.current = setTimeout(() => { isAutoScrollingRef.current = false; }, 1000);

                setMessages(prev => prev.map(m => m.id === streamId as any ? { ...m, content: m.content + evt.content } : m));
                // Give React a chance to render if multiple tokens arrived in one buffer chunk
                await new Promise(r => setTimeout(r, 0));
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
                setMessages(prev => prev.map(m => m.id === streamId as any ? { ...m, id: evt.id, citations: evt.citations, context: evt.context, created_at: evt.created_at, streaming: false } : m));
                if (selectedAssistant) fetchSessions(selectedAssistant.id);
              } else if (evt.type === 'error') {
                setMessages(prev => prev.map(m => m.id === streamId as any ? { ...m, content: `Error: ${evt.message}`, streaming: false } : m));
              }
            } catch {/* ignore malformed line */ }
          }
        }
      }
    } catch (e: any) {
      if (e.name !== 'AbortError') {
        setMessages(prev => prev.map(m => m.id === streamId as any ? { ...m, content: m.content || "Sorry, I encountered an error. Please try again.", streaming: false } : m));
      }
    } finally {
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
    setSessions(prev => prev.map(s => s.id === selectedSession.id ? { ...s, message_count: (s.message_count || 0) + 1 } : s));
    setIsLoading(true);
    setIsRegenerating(false);

    // Auto-scroll instantly when user sends message
    isAutoScrollingRef.current = true;
    setShowScrollButton(false);
    if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
    scrollTimeoutRef.current = setTimeout(() => { isAutoScrollingRef.current = false; }, 1000);
    setTimeout(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'auto' }); }, 50);

    await consumeStream(selectedSession.id, { query: userMessage }, 'chat/stream');

    setIsLoading(false);
    isAutoScrollingRef.current = true;
    setShowScrollButton(false);
    if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
    scrollTimeoutRef.current = setTimeout(() => { isAutoScrollingRef.current = false; }, 1000);
    setTimeout(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'auto' }); }, 50);
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
    setIsRegenerating(true);
    setMessages(prev => {
      const copy = [...prev];
      while (copy.length && copy[copy.length - 1].role === 'assistant') copy.pop();
      return copy;
    });

    await consumeStream(selectedSession.id, {}, 'regenerate/stream');
    setIsLoading(false);
    setIsRegenerating(false);
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
      showToast('success', t('toast.assistant.cloned'), t('toast.assistant.cloned.msg', { name: assistant.name }));
    } catch (e) {
      console.error(e);
      showToast('error', t('toast.err.clone'), t('toast.err.clone.msg'));
    }
  };

  // -------- Export / Import assistant --------
  const handleExportAssistant = async (assistant: Assistant) => {
    setAssistantMenuOpen(null);
    try {
      const res = await fetch(`/api/assistants/${assistant.id}/export`);
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const disposition = res.headers.get('Content-Disposition') || '';
      const match = disposition.match(/filename="([^"]+)"/);
      a.download = match ? match[1] : `assistant_${assistant.name}.zip`;
      a.href = url;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
      showToast('error', t('toast.export.failed'), t('toast.export.failed.msg'));
    }
  };

  const handleImportAssistant = async (file: File) => {
    setIsImporting(true);
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await fetch('/api/assistants/import', { method: 'POST', body: formData });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: 'Unknown error' }));
        throw new Error(err.detail || 'Import failed');
      }
      const data = await res.json();
      await fetchAssistants(); fetchStats(); fetchRecentSessions();
      if (data.import_warnings?.length) {
        showToast('info', t('toast.import.warn'), t('toast.import.warn.msg', { name: data.name }));
      } else {
        showToast('success', t('toast.import.success'), t('toast.import.success.msg', { name: data.name }));
      }
    } catch (e: any) {
      console.error(e);
      showToast('error', t('toast.import.failed'), e.message || t('toast.import.failed.msg'));
    } finally {
      setIsImporting(false);
      if (importInputRef.current) importInputRef.current.value = '';
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
      showToast('success', t('toast.branch.success'), t('toast.branch.success.msg'));
    } catch (e) {
      console.error(e);
      showToast('error', t('toast.branch.failed'), t('toast.branch.failed.msg'));
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
    if (!win) { showToast('error', t('toast.export.blocked'), t('toast.export.blocked.msg')); return; }
    win.document.open(); win.document.write(html); win.document.close();
  };

  // -------- Citation drill-down --------
  const handleCitationClick = (filename: string, messageContext?: string[]) => {
    const doc = documents.find(d => d.filename === filename);
    if (!doc) {
      showToast('info', t('toast.citation.unavailable'), t('toast.citation.unavailable.msg', { filename }));
      return;
    }
    const baseName = filename.split('#')[0].toLowerCase();

    // Find ALL context blocks that match this filename
    const matchingContexts = messageContext?.filter((c: string) => {
      const normalizedC = c.trim().toLowerCase();
      return normalizedC.startsWith(`[${baseName}]`) || normalizedC.startsWith(`[${baseName}#`);
    }) || [];

    if (matchingContexts.length > 0) {
      const snippets = matchingContexts.map(c => {
        const colonIdx = c.indexOf(']: ');
        return colonIdx !== -1 ? c.slice(colonIdx + 3).trim() : '';
      }).filter(Boolean);

      if (snippets.length > 0) {
        // Show snippet directly — skip loading the full document
        setPreviewDoc({ id: doc.id, filename: doc.filename });
        setPreviewLoading(false);
        setPreviewContent({ type: 'snippet', filename: doc.filename, content: snippets.join('\n\n') });
        return;
      }
    }
    handlePreviewDocument({ id: doc.id, filename: doc.filename });
  };

  // ---- Helpers ----
  const getDateGroup = (dateStr?: string) => {
    if (!dateStr) return null;
    const date = new Date(dateStr);
    return new Intl.DateTimeFormat(lang === 'en' ? 'en-US' : 'es-ES', { timeZone: 'Europe/Paris', year: 'numeric', month: 'numeric', day: 'numeric' }).format(date);
  };

  const formatDateSeparator = (dateStr?: string) => {
    if (!dateStr) return '';
    const targetGroup = getDateGroup(dateStr);

    const now = new Date();
    const todayGroup = getDateGroup(now.toISOString());

    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayGroup = getDateGroup(yesterday.toISOString());

    if (targetGroup === todayGroup) return t('date.today');
    if (targetGroup === yesterdayGroup) return t('date.yesterday');

    const date = new Date(dateStr);
    return new Intl.DateTimeFormat(lang === 'en' ? 'en-US' : 'es-ES', { timeZone: 'Europe/Paris', month: 'long', day: 'numeric', year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined }).format(date);
  };

  const formatTime = (dateStr?: string) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleTimeString(lang === 'en' ? 'en-US' : 'es-ES', { timeZone: 'Europe/Paris', hour: 'numeric', minute: '2-digit' });
  };

  // ---- Renders ----

  return (
    <div className="flex h-screen w-full bg-slate-50 dark:bg-slate-950 overflow-hidden font-sans text-slate-900 dark:text-white">

      {/* Mobile Nav Trigger (moved inside header) */}

      {/* Hidden import file input */}
      <input
        type="file"
        ref={importInputRef}
        accept=".zip"
        className="hidden"
        onChange={e => { if (e.target.files?.[0]) handleImportAssistant(e.target.files[0]); }}
      />

      {sidebarOpen && <div className="fixed inset-0 bg-black/20 z-40 md:hidden" onClick={() => setSidebarOpen(false)} />}

      {/* Global Sidebar (Assistants) - hidden on homepage */}
      {selectedAssistant && (
        <aside className={`fixed md:static inset-y-0 left-0 bg-slate-50 dark:bg-slate-950 border-r border-slate-200 dark:border-slate-800 text-slate-700 dark:text-gray-300 w-72 transform transition-transform duration-300 z-50 flex flex-col ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
          <div className="h-[64px] md:h-[76px] px-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0">
            <button onClick={() => { setSelectedAssistant(null); setSidebarOpen(false); }} className="flex items-center gap-2 hover:opacity-80 transition-opacity">
              <img src={logo} alt="Lincite Logo" className="w-8 h-8 rounded-lg" />
              <h1 className="text-lg font-bold text-slate-900 dark:text-white tracking-wide">Lincite</h1>
            </button>
            <button className="md:hidden text-slate-600 dark:text-slate-400" onClick={() => setSidebarOpen(false)}><X size={20} /></button>
          </div>

          <div className="p-4">
            <button
              onClick={() => setShowAddModal(true)}
              className="w-full flex items-center justify-center gap-2 py-2.5 bg-primary-600 hover:bg-primary-500 text-white rounded-lg font-medium transition-colors text-sm"
            >
              <Plus size={16} /> {t('nav.newAssistant')}
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-1">
            <div className="px-3 pt-2 pb-1 text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">{t('nav.yourAssistants')}</div>
            {assistants.length === 0 ? (
              <div className="px-3 py-4 text-sm text-slate-600 dark:text-slate-400 italic text-center">{t('nav.noAssistants')}</div>
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
                  className={`w-full text-left px-2 py-3 rounded-lg flex items-center justify-between cursor-pointer group transition-colors ${selectedAssistant?.id === a.id ? 'bg-slate-200 dark:bg-slate-800 text-slate-900 dark:text-white' : 'hover:bg-slate-100 dark:hover:bg-slate-800/60 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'} ${dragOverAssistantId === a.id && draggingAssistantId !== a.id ? 'ring-2 ring-primary-400 dark:ring-primary-500' : ''} ${draggingAssistantId === a.id ? 'opacity-50' : ''}`}
                >
                  <div className="flex items-center gap-2 overflow-hidden flex-1">
                    <span className="text-slate-400 dark:text-slate-600 cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity" title={t('nav.dragHint')}>
                      <GripVertical size={14} />
                    </span>
                    {a.image_url ? (
                      <img src={a.image_url} alt={a.name} className="w-7 h-7 rounded-lg object-cover shrink-0" />
                    ) : (
                      <Bot size={18} className={selectedAssistant?.id === a.id ? "text-primary-600 dark:text-primary-400" : "text-slate-600 dark:text-slate-400 group-hover:text-primary-500"} />
                    )}
                    <div className="truncate flex items-center gap-1.5 min-w-0">
                      <span className="text-sm font-medium truncate">{a.name}</span>
                    </div>
                  </div>
                  <div className="flex gap-1 items-center shrink-0 assistant-menu-container">
                    <div className="relative flex items-center justify-end min-w-[28px] h-8">
                      {!!a.pinned && (
                        <div className="absolute right-1 p-1 text-slate-400 transition-all duration-300 transform group-hover:-translate-x-6">
                          <Pin size={12} className="fill-slate-400" />
                        </div>
                      )}
                      <button onClick={(e) => { e.stopPropagation(); setAssistantMenuOpen(assistantMenuOpen === a.id ? null : a.id); }} className="relative z-10 p-1 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-300 dark:hover:bg-slate-700 rounded transition-all opacity-0 group-hover:opacity-100">
                        <MoreHorizontal size={14} />
                      </button>
                      {assistantMenuOpen === a.id && (
                        <div className="absolute right-0 top-full mt-1 z-50 w-44 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg py-1 text-sm">
                          <button onClick={(e) => { e.stopPropagation(); handleEditAssistantClick(a, e); setAssistantMenuOpen(null); }} className="w-full text-left px-3 py-2 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 flex items-center gap-2"><Edit2 size={14} /> {t('nav.menu.edit')}</button>
                          <button onClick={(e) => { e.stopPropagation(); handleTogglePin(a); }} className="w-full text-left px-3 py-2 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 flex items-center gap-2"><Pin size={14} /> {a.pinned ? t('nav.menu.unpin') : t('nav.menu.pin')}</button>
                          <button onClick={(e) => { e.stopPropagation(); handleCloneAssistant(a); }} className="w-full text-left px-3 py-2 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 flex items-center gap-2"><Copy size={14} /> {t('nav.menu.clone')}</button>
                          <button onClick={(e) => { e.stopPropagation(); handleExportAssistant(a); }} className="w-full text-left px-3 py-2 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 flex items-center gap-2"><Download size={14} /> {t('nav.menu.export')}</button>
                          <button onClick={(e) => { e.stopPropagation(); setAssistantMenuOpen(null); handleDeleteAssistant(a, e); }} className="w-full text-left px-3 py-2 hover:bg-red-50 dark:hover:bg-red-500/10 text-red-600 dark:text-red-400 flex items-center gap-2"><Trash2 size={14} /> {t('nav.menu.delete')}</button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="p-4 border-t border-slate-200 dark:border-slate-800 shrink-0 space-y-1">
            <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} className="w-full flex items-center justify-center gap-2 py-2 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg transition-colors text-sm font-medium">
              {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
              {theme === 'dark' ? t('nav.theme.light') : t('nav.theme.dark')}
            </button>
            <button onClick={() => setLang(lang === 'en' ? 'es' : 'en')} className="w-full flex items-center justify-center gap-2 py-2 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg transition-colors text-sm font-medium">
              <Globe size={16} /> {t('lang.toggle')}
            </button>
          </div>
        </aside>
      )}

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col h-full bg-white dark:bg-slate-900 relative min-w-0">
        {selectedAssistant ? (
          <>
            <header className="min-h-[56px] md:min-h-[76px] py-1.5 md:py-3 px-2 md:px-6 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between shadow-sm z-[80] w-full shrink-0 gap-1.5 md:gap-3">
              <div className="flex items-center gap-1.5 md:gap-3 min-w-0 flex-1 overflow-hidden">
                <button onClick={() => setSidebarOpen(!sidebarOpen)} className="md:hidden -ml-0.5 p-1.5 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors focus:outline-none focus:ring-0">
                  {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
                </button>
                <button onClick={() => setSelectedAssistant(null)} className="md:hidden p-1.5 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors" title="Home">
                  <Home size={18} />
                </button>
                <div className="md:hidden w-px h-5 bg-slate-200 dark:bg-slate-800 mx-0.5" />

                <button
                  onClick={() => setShowAssistantDetails(true)}
                  className="flex items-center gap-2 md:gap-3 hover:opacity-80 transition-opacity min-w-0 flex-1 text-left"
                >
                  {selectedAssistant.image_url ? (
                    <img src={selectedAssistant.image_url} alt={selectedAssistant.name} className="w-8 h-8 md:w-10 md:h-10 rounded-lg object-cover shrink-0 border border-slate-200 dark:border-slate-800" />
                  ) : (
                    <div className="p-1.5 md:p-2 bg-primary-900/30 text-primary-400 rounded-lg shrink-0">
                      <Bot size={18} className="md:w-6 md:h-6" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <h2 className="text-[13px] md:text-lg font-bold text-slate-800 dark:text-slate-200 leading-tight truncate">{selectedAssistant.name}</h2>
                    {selectedAssistant.description && (
                      <p className="text-[10px] md:text-xs text-slate-500 dark:text-slate-400 truncate opacity-70 leading-none mt-0.5" title={selectedAssistant.description}>
                        {selectedAssistant.description}
                      </p>
                    )}
                  </div>
                </button>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {activeTab === 'chat' && selectedSession && (
                  <>
                    <button
                      onClick={() => { setChatSearchOpen(true); setTimeout(() => chatSearchInputRef.current?.focus(), 50); }}
                      title={t('header.search')}
                      className="p-2 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors"
                    >
                      <Search size={16} />
                    </button>
                    <div className="relative export-menu-container">
                      <button
                        onClick={() => setShowExportMenu(o => !o)}
                        title={t('header.export')}
                        className="p-2 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors"
                      >
                        <Download size={16} />
                      </button>
                      {showExportMenu && (
                        <div className="absolute right-0 mt-1 w-44 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg py-1 z-[100] text-sm">
                          <button onClick={handleExportMarkdown} className="w-full text-left px-3 py-2 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 flex items-center gap-2"><FileText size={14} /> {t('header.export.md')}</button>
                          <button onClick={handleExportPdf} className="w-full text-left px-3 py-2 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 flex items-center gap-2"><FileText size={14} /> {t('header.export.pdf')}</button>
                        </div>
                      )}
                    </div>
                  </>
                )}
                <div className="flex gap-0.5 md:gap-1 bg-slate-100 dark:bg-slate-800 p-0.5 md:p-1 rounded-lg">
                  <button
                    onClick={() => setActiveTab('chat')}
                    className={`px-2.5 md:px-4 py-1 md:py-1.5 rounded-md text-sm font-medium transition-all flex items-center gap-2 ${activeTab === 'chat' ? 'bg-white dark:bg-slate-900 text-primary-600 dark:text-primary-400 shadow-sm' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700'}`}
                    title="Switch to Chat"
                  >
                    <MessageSquare size={16} /> <span className="hidden md:inline">{t('header.tab.chat')}</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('docs')}
                    className={`px-2.5 md:px-4 py-1 md:py-1.5 rounded-md text-sm font-medium transition-all flex items-center gap-2 ${activeTab === 'docs' ? 'bg-white dark:bg-slate-900 text-primary-600 dark:text-primary-400 shadow-sm' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700'}`}
                    title="Switch to Documents"
                  >
                    <BookOpen size={16} /> <span className="hidden lg:inline">{t('header.tab.docs')}</span><span className="hidden md:inline lg:hidden">{t('header.tab.docs.short')}</span>
                  </button>
                </div>
              </div>
            </header>

            {/* TAB ROUTING - Persistent visibility to preserve scroll state */}
            <div className={`flex-1 flex overflow-hidden min-w-0 ${activeTab !== 'chat' ? 'hidden' : ''}`}>
              <div className="flex-1 flex overflow-hidden min-w-0">
                {/* Left Drawer: Sessions */}
                <div className={`w-full md:w-64 border-r border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50 flex flex-col transition-all duration-300 ${selectedSession ? 'hidden md:flex' : 'flex'} ${!showChatsPane ? 'md:hidden' : ''}`}>
                  <div className="p-4">
                    <button
                      onClick={handleCreateSession}
                      className="w-full flex items-center justify-center gap-2 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-lg font-medium transition-colors text-sm shadow-sm"
                    >
                      <Plus size={16} /> {t('chat.newChat')}
                    </button>
                  </div>
                  <div className="flex-1 overflow-y-auto p-2 space-y-1">
                    {sessions.map(s => (
                      <div
                        key={s.id}
                        onClick={() => {
                          if (selectedSession?.id === s.id || renamingSessionId === s.id) return;
                          setSelectedSession(s);
                          setChatSearchResults([]);
                          setChatSearchQuery('');
                        }}
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          if (renamingSessionId !== s.id) startRenameSession(s);
                        }}
                        className={`w-full group px-3 py-2.5 rounded-md cursor-pointer transition-colors ${selectedSession?.id === s.id ? 'bg-primary-50 dark:bg-primary-900/30 font-medium' : 'hover:bg-slate-200 dark:hover:bg-slate-800'}`}
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
                              className="flex-1 text-sm bg-white dark:bg-slate-900 border border-primary-400 dark:border-primary-500 rounded px-2 py-0.5 outline-none text-slate-900 dark:text-white"
                            />
                          ) : (
                            <span className={`truncate pr-2 text-sm ${selectedSession?.id === s.id ? 'text-primary-700 dark:text-primary-300 font-semibold' : 'text-slate-700 dark:text-slate-300 group-hover:text-slate-900 dark:group-hover:text-white'}`}>{s.title || t('session.default')}</span>
                          )}
                          {renamingSessionId !== s.id && (
                            <div className="flex items-center gap-0.5 shrink-0">
                              <button
                                onClick={(e) => { e.stopPropagation(); startRenameSession(s); }}
                                onDoubleClick={(e) => e.stopPropagation()}
                                className={`opacity-0 group-hover:opacity-100 p-1.5 text-slate-500 hover:text-primary-500 hover:bg-primary-50 dark:hover:text-primary-400 dark:hover:bg-primary-500/10 rounded transition-all`}
                                title={t('session.rename')}
                              >
                                <Edit2 size={13} />
                              </button>
                              {(s.message_count ?? 0) > 0 && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); setSessionToClear(s); }}
                                  className={`opacity-0 group-hover:opacity-100 p-1.5 text-slate-500 hover:text-amber-500 hover:bg-amber-50 dark:hover:text-amber-400 dark:hover:bg-amber-500/10 rounded transition-all`}
                                  title={t('clear.session.confirm')}
                                >
                                  <Eraser size={13} />
                                </button>
                              )}
                              <button
                                onClick={(e) => handleDeleteSession(s, e)}
                                className={`opacity-0 group-hover:opacity-100 p-1.5 text-slate-500 hover:text-red-500 hover:bg-red-50 dark:hover:text-red-400 dark:hover:bg-red-500/10 rounded transition-all ${selectedSession?.id === s.id ? 'text-primary-500 dark:text-primary-400 hover:text-red-500 hover:bg-red-50 dark:hover:text-red-400 dark:hover:bg-red-500/10' : ''}`}
                                title={t('session.delete')}
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          )}
                        </div>
                        <div className={`text-[10px] mt-0.5 ${selectedSession?.id === s.id ? 'text-primary-400/70' : 'text-slate-500'}`}>
                          {s.updated_at ? new Date(s.updated_at).toLocaleDateString(lang === 'en' ? 'en-US' : 'es-ES', { timeZone: 'Europe/Paris', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : t('date.justNow')}
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
                      <h3 className="text-lg font-medium text-slate-600 dark:text-slate-400 mb-2">{t('chat.noSession.title')}</h3>
                      <p className="text-sm max-w-sm">{t('chat.noSession.hint')}</p>
                      <button onClick={handleCreateSession} className="mt-6 px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-500 shadow-sm transition-colors">{t('chat.noSession.start')}</button>
                    </div>
                  ) : (
                    <>
                      {/* Mobile back button */}
                      <div className="md:hidden border-b border-slate-200 dark:border-slate-800 bg-white/90 dark:bg-slate-900/90 backdrop-blur-sm flex items-center px-4 py-2 shrink-0 z-10 sticky top-0">
                        <button onClick={() => { setSelectedSession(null); setChatSearchResults([]); setChatSearchQuery(''); }} className="flex items-center text-sm font-medium text-primary-400 hover:text-primary-300 py-1">
                          <ChevronLeft size={18} className="mr-1" /> {t('session.backToChats')}
                        </button>
                      </div>

                      <div ref={chatScrollRef} className="flex-1 overflow-y-auto p-4 md:p-8 w-full relative" onScroll={handleScroll}>
                        <div className="max-w-3xl mx-auto space-y-8 pb-32">
                          {messages.length === 0 && (
                            <div className="flex flex-col items-center text-center mt-20 text-slate-500">
                              <Bot size={40} className="mb-3 text-primary-200" />
                              <p>{t('chat.empty')}</p>
                            </div>
                          )}

                          {messages.map((msg, index) => {
                            let cleanContent = msg.content;
                            if (msg.citations) {
                              cleanContent = msg.content;
                              // Strip specific citations [file.pdf#0] and base ones [file.pdf]
                              msg.citations.forEach(cite => {
                                const baseCite = cite.split('#')[0];
                                const escapedFull = cite.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                                const escapedBase = baseCite.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                                cleanContent = cleanContent.replace(new RegExp(`\\s?\\[${escapedFull}\\]`, 'gi'), '');
                                cleanContent = cleanContent.replace(new RegExp(`\\s?\\[${escapedBase}\\]`, 'gi'), '');
                              });
                              // Catch-all for any remaining file-like citations to ensure clean UI
                              cleanContent = cleanContent.replace(/\[[^\]]+\.(pdf|docx|txt|csv|md)(#[0-9]+)?\]/gi, '');
                            } else if (msg.streaming) {
                              // Aggressive real-time citation hiding
                              // 1. Hide completed citations (including #ID)
                              cleanContent = msg.content.replace(/\[[^\]]+(\.pdf|\.docx|\.txt|\.csv|\.md)(#[0-9]+)?\]/gi, '');
                              // 2. Hide partial citations at the end of the text (e.g. "[file.pdf")
                              cleanContent = cleanContent.replace(/\[[^\]]*$/g, '');
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
                                <div id={`message-${msg.id}`} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} scroll-mt-24 transition-all duration-500 rounded-2xl`}>
                                  <div className={`max-w-[95%] md:max-w-[85%] rounded-2xl px-4 md:px-5 py-3 md:py-4 min-w-0 overflow-x-auto ${msg.role === 'user'
                                    ? 'bg-primary-600 text-white rounded-br-none shadow-sm'
                                    : 'bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 rounded-bl-none shadow-sm'
                                    }`}>
                                    {msg.role === 'user' ? (
                                      <div className="whitespace-pre-wrap leading-relaxed text-base break-words">{cleanContent}</div>
                                    ) : (
                                      <div className="text-base leading-relaxed prose dark:prose-invert prose-slate max-w-none prose-p:leading-relaxed prose-pre:bg-slate-50 dark:prose-pre:bg-slate-900 prose-pre:border prose-pre:border-slate-200 dark:prose-pre:border-slate-800 prose-code:text-primary-600 dark:prose-code:text-primary-300 break-words prose-pre:max-w-full">
                                        {msg.streaming && !cleanContent.trim() ? (
                                          <div className="flex items-center space-x-2 text-slate-400 py-1">
                                            <Loader2 size={16} className="animate-spin text-primary-500" />
                                            <span className="text-sm inline-flex items-center">
                                              {isRegenerating ? t('chat.regenerating') : 'Processing request'}
                                              <span className="inline-block w-[10px] text-left ml-0.5">{loadingDots}</span>
                                            </span>
                                          </div>
                                        ) : (
                                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                            {cleanContent}
                                          </ReactMarkdown>
                                        )}
                                      </div>
                                    )}

                                    {(msg.citations && msg.citations.length > 0) || (msg.streaming && cleanContent !== msg.content) ? (
                                      <div className="mt-4 pt-3 border-t border-slate-200/60 border-slate-200/60 dark:border-slate-800/60">
                                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-2">{t('chat.sources')}</span>
                                        <div className="flex flex-wrap gap-1.5">
                                          {msg.citations ? Array.from(new Set(msg.citations.map(c => c.split('#')[0]))).map((baseCite, i) => (
                                            <button
                                              key={i}
                                              onClick={() => handleCitationClick(baseCite, msg.context)}
                                              title={`Open sources from ${baseCite}`}
                                              className="inline-flex items-center px-2 py-1 rounded bg-white dark:bg-slate-900 shadow-sm border border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-400 font-medium hover:border-primary-400 dark:hover:border-primary-500 hover:text-primary-600 dark:hover:text-primary-300 transition-colors"
                                            >
                                              <FileText size={10} className="mr-1 text-primary-400" />
                                              {baseCite}
                                            </button>
                                          )) : (
                                            <div className="flex items-center gap-2 text-[10px] text-slate-500 italic">
                                              <Loader2 size={10} className="animate-spin" /> {t('chat.sources.hint')}
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                    ) : null}

                                    {msg.created_at && (
                                      <div className={`text-[10px] mt-2 font-medium ${msg.role === 'user' ? 'text-primary-200 text-right' : 'text-slate-400 dark:text-slate-500 text-left'}`}>
                                        {formatTime(msg.created_at)}
                                      </div>
                                    )}
                                  </div>
                                </div>
                                {msg.role === 'assistant' && !msg.streaming && msg.id !== undefined && (
                                  <div className="flex items-center gap-1 -mt-3 ml-1 text-slate-400 dark:text-slate-500">
                                    <button
                                      onClick={() => handleFeedback(msg.id, 1)}
                                      title={t('chat.action.helpful')}
                                      className={`p-1.5 rounded-md transition-colors ${msg.feedback === 1 ? 'text-emerald-500 bg-emerald-50 dark:bg-emerald-500/10' : 'hover:text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-500/10'}`}
                                    >
                                      <ThumbsUp size={13} />
                                    </button>
                                    <button
                                      onClick={() => handleFeedback(msg.id, -1)}
                                      title={t('chat.action.notHelpful')}
                                      className={`p-1.5 rounded-md transition-colors ${msg.feedback === -1 ? 'text-red-500 bg-red-50 dark:bg-red-500/10' : 'hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10'}`}
                                    >
                                      <ThumbsDown size={13} />
                                    </button>
                                    <button
                                      onClick={() => handleBranchFromMessage(msg.id)}
                                      title={t('chat.action.branch')}
                                      className="p-1.5 rounded-md hover:text-primary-500 hover:bg-primary-50 dark:hover:bg-primary-500/10 transition-colors"
                                    >
                                      <GitBranch size={13} />
                                    </button>
                                    {index === messages.length - 1 && (
                                      <button
                                        onClick={handleRegenerate}
                                        disabled={isLoading}
                                        title={t('chat.action.regenerate')}
                                        className="p-1.5 rounded-md hover:text-primary-500 hover:bg-primary-50 dark:hover:bg-primary-500/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                      >
                                        <RotateCcw size={13} />
                                      </button>
                                    )}
                                  </div>
                                )}
                              </React.Fragment>
                            )
                          })}

                          {isLoading && !messages.some(m => m.streaming) && (
                            <div className="flex justify-start">
                              <div className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl rounded-bl-none px-5 py-4 shadow-sm flex items-center space-x-2 text-primary-1000">
                                <Loader2 size={18} className="animate-spin text-primary-500" />
                                <span className="text-sm font-medium">{t('chat.loading')}</span>
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
                                className="p-2 bg-primary-600 hover:bg-primary-500 text-white rounded-full shadow-lg transition-transform hover:scale-105 active:scale-95 flex items-center justify-center animate-in fade-in slide-in-from-bottom-2"
                              >
                                <ArrowDown size={20} />
                              </button>
                            </div>
                          )}
                          <form onSubmit={handleSend} className="relative flex items-end overflow-hidden rounded-2xl bg-white dark:bg-slate-900 shadow-[0_0_20px_rgba(0,0,0,0.08)] border border-slate-200 dark:border-slate-800 focus-within:border-primary-400 dark:focus-within:border-primary-500/50 focus-within:ring-2 focus-within:ring-primary-100 dark:focus-within:ring-primary-500/20 transition-all min-w-0">
                            <textarea
                              value={input}
                              onChange={(e) => setInput(e.target.value)}
                              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(e); } }}
                              placeholder={t('chat.input.placeholder', { name: selectedAssistant.name })}
                              className="px-4 md:px-5 py-3 md:py-4 w-full bg-transparent border-0 focus:ring-0 resize-none max-h-48 outline-none text-slate-800 dark:text-slate-200 placeholder-slate-500 dark:placeholder-gray-400 text-base min-w-0"
                              rows={input.split('\n').length > 1 ? Math.min(input.split('\n').length, 5) : 1}
                              style={{ minHeight: '56px' }}
                            />
                            <button type="submit" disabled={!input.trim() || isLoading} className="absolute right-2 bottom-2 p-2.5 rounded-xl bg-primary-600 text-white disabled:bg-slate-200 dark:disabled:bg-slate-200 dark:disabled:bg-slate-700 disabled:text-slate-500 hover:bg-primary-500 transition-colors shadow-sm">
                              <Send size={16} />
                            </button>
                          </form>
                          <div className="text-center mt-2">
                            <span className="text-[11px] text-slate-500 font-medium tracking-wide">{t('chat.input.hint')}</span>
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className={`flex-1 overflow-y-auto bg-slate-50/50 dark:bg-slate-950/50 p-6 md:p-12 ${activeTab !== 'docs' ? 'hidden' : ''}`}>
              <div className="max-w-4xl mx-auto space-y-8">

                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-6 md:p-8">
                  <div className="flex items-center justify-between mb-6">
                    <div>
                      <h3 className="text-lg font-semibold text-slate-900 dark:text-white">{t('docs.title')}</h3>
                      <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">{t('docs.hint')}</p>
                    </div>

                    <input type="file" multiple className="hidden" ref={fileInputRef} onChange={handleUpload} accept=".pdf,.docx,.pptx,.txt,.csv,.md,.png,.jpg,.jpeg,.bmp" />
                  </div>

                  {/* Dedicated Dropzone */}
                  <div
                    className={`mb-8 flex flex-col items-center justify-center p-10 border-2 border-dashed rounded-xl transition-colors cursor-pointer ${isDragging ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20' : 'border-slate-300 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-950/50 hover:border-primary-500/50 hover:bg-primary-50 dark:hover:bg-primary-900/10'}`} onDragEnter={handleDragEnter} onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <div className="p-3 bg-slate-100 dark:bg-slate-800 rounded-full mb-4">
                      {uploading ? <Loader2 className="animate-spin text-primary-400" size={24} /> : <Upload className="text-primary-400" size={24} />}
                    </div>
                    <h4 className="text-base font-semibold text-slate-900 dark:text-white mb-1">
                      {uploading ? t('docs.upload.processing') : t('docs.upload.cta')}
                    </h4>
                    <p className="text-sm text-slate-600 dark:text-slate-400 text-center max-w-sm">
                      {t('docs.upload.formats')}
                    </p>
                  </div>

                  {documents.length === 0 ? (
                    <div className="text-center py-12 px-4 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50 dark:bg-slate-950">
                      <BookOpen className="mx-auto h-12 w-12 text-slate-700 dark:text-gray-300" />
                      <h4 className="mt-4 text-sm font-medium text-slate-900 dark:text-white">{t('docs.empty.title')}</h4>
                      <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{t('docs.empty.hint')}</p>
                    </div>
                  ) : (
                    <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                      <div className="bg-slate-100 dark:bg-slate-950 px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase">
                        <div className="flex-1">{t('docs.col.filename')}</div>
                        <div className="w-24 text-right">{t('docs.col.actions')}</div>
                      </div>
                      <ul className="divide-y divide-slate-200 dark:divide-slate-800/80 bg-white dark:bg-slate-900">
                        {documents.map(doc => (
                          <li key={doc.id} className="px-4 py-3 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                            <div className="flex items-center gap-3 overflow-hidden">
                              <FileText size={16} className="text-primary-500 shrink-0" />
                              <button onClick={() => handlePreviewDocument(doc)} className="text-sm font-medium text-slate-700 dark:text-slate-300 truncate hover:text-primary-600 dark:hover:text-primary-400 transition-colors text-left" title={t('docs.action.preview')}>{doc.filename}</button>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <button onClick={() => handlePreviewDocument(doc)} className="p-1.5 text-slate-400 hover:text-primary-500 hover:bg-primary-500/10 rounded-md transition-colors" title={t('docs.action.preview')}>
                                <Eye size={16} />
                              </button>
                              <button onClick={() => handleDeleteDocument(doc)} className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-500/10 rounded-md transition-colors" title={t('docs.action.delete')}>
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
                    <Settings size={20} className="text-slate-500" /> {t('docs.system')}
                  </h3>
                  <div className="bg-slate-50 dark:bg-slate-950 p-6 rounded-xl text-sm text-slate-700 dark:text-slate-300 border border-slate-200/50 dark:border-slate-800/50 leading-relaxed prose prose-slate dark:prose-invert max-w-none">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {selectedAssistant.instructions}
                    </ReactMarkdown>
                  </div>
                </div>

              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 overflow-y-auto bg-slate-50 dark:bg-slate-950 flex flex-col">
            {/* Homepage Top Bar */}
            <div className="h-[76px] px-5 md:px-8 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <img src={logo} alt="Lincite Logo" className="w-8 h-8 rounded-lg" />
                <h1 className="text-lg font-bold text-slate-900 dark:text-white tracking-wide">Lincite</h1>
              </div>
              <div className="flex items-center gap-2">
                <div className="hidden sm:flex items-center gap-0.5 mr-1">
                  <button
                    onClick={() => setShowImportInfo(true)}
                    className="p-1.5 text-slate-400 hover:text-primary-500 hover:bg-primary-50 dark:hover:bg-primary-500/10 rounded-full transition-all"
                    title="Required Structure Info"
                  >
                    <Info size={16} />
                  </button>
                  <button
                    onClick={() => importInputRef.current?.click()}
                    disabled={isImporting}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors disabled:opacity-50"
                    title={t('nav.import.hint')}
                  >
                    {isImporting ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
                    {t('nav.import')}
                  </button>
                </div>
                <button
                  onClick={() => setShowAddModal(true)}
                  className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 text-sm font-medium bg-primary-600 text-white hover:bg-primary-500 rounded-lg transition-colors shadow-sm"
                >
                  <Plus size={15} /> <span className="hidden sm:inline">{t('nav.newAssistant')}</span>
                </button>
                <button onClick={() => setLang(lang === 'en' ? 'es' : 'en')} className="p-2 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors" title={t('lang.toggle')}>
                  <Globe size={18} />
                </button>
                <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} className="p-2 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors" title={theme === 'dark' ? t('nav.theme.light') : t('nav.theme.dark')}>
                  {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
                </button>
              </div>
            </div>

            {/* Homepage Content */}
            <div className="flex-1 max-w-6xl w-full mx-auto px-4 md:px-8 py-8 md:py-10">

              {/* Hero */}
              <div className="mb-8">
                <h2 className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-white mb-2 tracking-tight">{t('home.hero.title')}</h2>
                <p className="text-slate-500 dark:text-slate-400 text-sm md:text-base">{t('home.hero.subtitle')}</p>
              </div>

              {/* Stats Strip */}
              {stats && (
                <div className="grid grid-cols-3 gap-3 mb-8">
                  {[
                    { label: t('home.stats.assistants'), value: stats.assistants, icon: <Bot size={18} className="text-primary-500" /> },
                    { label: t('home.stats.documents'), value: stats.documents, icon: <FileText size={18} className="text-emerald-500" /> },
                    { label: t('home.stats.conversations'), value: stats.sessions, icon: <MessageSquare size={18} className="text-violet-500" /> },
                  ].map(s => (
                    <div key={s.label} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3 flex items-center gap-3">
                      <div className="p-2 bg-slate-50 dark:bg-slate-800 rounded-lg shrink-0">{s.icon}</div>
                      <div className="min-w-0">
                        <p className="text-xl font-bold text-slate-900 dark:text-white leading-none">{s.value}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">{s.label}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {assistants.length > 0 ? (
                <div className="flex flex-col lg:flex-row gap-8">
                  {/* Left: Assistants grid */}
                  <div className="flex-1 min-w-0">
                    {/* Search + sort toolbar */}
                    <div className="flex items-center gap-2 mb-5">
                      <div className="relative flex-1">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                        <input
                          type="text"
                          value={homeSearch}
                          onChange={e => setHomeSearch(e.target.value)}
                          placeholder={t('home.search.placeholder')}
                          className="w-full pl-8 pr-3 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-primary-500/40 focus:border-primary-500 text-slate-900 dark:text-white placeholder-slate-400"
                        />
                      </div>
                      <div className="relative">
                        <select
                          value={homeSort}
                          onChange={e => setHomeSort(e.target.value as typeof homeSort)}
                          className="appearance-none text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl pl-3 pr-9 py-2 text-slate-700 dark:text-slate-300 outline-none focus:ring-2 focus:ring-primary-500/40 cursor-pointer"
                        >
                          <option value="default">{t('home.sort.default')}</option>
                          <option value="alpha">{t('home.sort.alpha')}</option>
                          <option value="recent">{t('home.sort.recent')}</option>
                        </select>
                        <ChevronDown size={14} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                      </div>
                    </div>

                    {/* Grid */}
                    {(() => {
                      let filtered = assistants.filter(a =>
                        !homeSearch || a.name.toLowerCase().includes(homeSearch.toLowerCase()) || (a.description || '').toLowerCase().includes(homeSearch.toLowerCase())
                      );
                      if (homeSort === 'alpha') filtered = [...filtered].sort((a, b) => a.name.localeCompare(b.name));
                      else if (homeSort === 'recent') filtered = [...filtered].sort((a, b) => (b.sort_order ?? 0) - (a.sort_order ?? 0));
                      if (filtered.length === 0) return (
                        <p className="text-sm text-slate-400 text-center py-10">{t('home.search.noResults', { q: homeSearch })}</p>
                      );
                      return (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          {filtered.map(a => (
                            <button
                              key={a.id}
                              onClick={() => setSelectedAssistant(a)}
                              className="group relative text-left bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 hover:border-primary-300 dark:hover:border-primary-500/40 hover:shadow-lg hover:shadow-primary-500/5 dark:hover:shadow-primary-500/10 transition-all duration-200 cursor-pointer"
                            >
                              <div className="flex items-start justify-between mb-3">
                                {a.image_url ? (
                                  <img src={a.image_url} alt={a.name} className="w-12 h-12 rounded-xl object-cover shrink-0 group-hover:shadow-md transition-shadow" />
                                ) : (
                                  <div className="p-2.5 bg-primary-50 dark:bg-primary-900/30 rounded-xl text-primary-600 dark:text-primary-400 group-hover:bg-primary-100 dark:group-hover:bg-primary-900/50 transition-colors">
                                    <Bot size={20} />
                                  </div>
                                )}
                              </div>
                              <h4 className="text-sm font-semibold text-slate-900 dark:text-white mb-1 group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors truncate">{a.name}</h4>
                              <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 leading-relaxed">{a.description || t('home.assistant.noDescription')}</p>
                              {!!a.pinned && <span className="absolute top-3 right-3 text-amber-400"><Pin size={12} className="fill-amber-400" /></span>}
                            </button>
                          ))}
                        </div>
                      );
                    })()}
                  </div>

                  {/* Right rail: Recent activity */}
                  <div className="lg:w-72 shrink-0 space-y-4">
                    {/* Recent conversations */}
                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5">
                      <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                        {t('home.recent.title')}
                      </h3>
                      {recentSessions.length === 0 ? (
                        <p className="text-xs text-slate-400 text-center py-3">{t('home.recent.empty')}</p>
                      ) : (
                        <ul className="space-y-2">
                          {recentSessions.map(s => {
                            const asst = assistants.find(a => a.id === s.assistant_id);
                            return (
                              <li key={s.id}>
                                <button
                                  onClick={() => {
                                    if (asst) {
                                      setSelectedAssistant(asst);
                                      setTimeout(() => setSelectedSession({ id: s.id, title: s.title, assistant_id: s.assistant_id, updated_at: s.updated_at || '' }), 100);
                                    }
                                  }}
                                  className="w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors group"
                                >
                                  {s.assistant_image_url ? (
                                    <img src={s.assistant_image_url} alt={s.assistant_name} className="w-7 h-7 rounded-lg object-cover shrink-0" />
                                  ) : (
                                    <div className="w-7 h-7 rounded-lg bg-primary-100 dark:bg-primary-900/40 flex items-center justify-center shrink-0">
                                      <Bot size={14} className="text-primary-500" />
                                    </div>
                                  )}
                                  <div className="min-w-0 flex-1">
                                    <p className="text-xs font-medium text-slate-700 dark:text-slate-300 truncate group-hover:text-primary-600 dark:group-hover:text-primary-400">{s.title}</p>
                                    <p className="text-[11px] text-slate-400 truncate">{s.assistant_name}</p>
                                  </div>
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>

                    {/* Quick actions */}
                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5">
                      <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                        {t('home.quickActions')}
                      </h3>
                      <div className="space-y-2">
                        <button onClick={() => setShowAddModal(true)} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl transition-colors text-left">
                          <Plus size={15} className="text-primary-500" /> {t('home.quickActions.new')}
                        </button>
                        <button onClick={() => importInputRef.current?.click()} disabled={isImporting} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl transition-colors text-left disabled:opacity-50">
                          {isImporting ? <Loader2 size={15} className="animate-spin text-slate-400" /> : <Download size={15} className="text-slate-400" />} {t('home.quickActions.import')}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                /* Empty state */
                <div className="flex flex-col lg:flex-row gap-8 items-start">
                  <div className="flex-1">
                    <div className="bg-white dark:bg-slate-900 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl p-8 md:p-12 text-center mb-6">
                      <div className="w-14 h-14 bg-primary-50 dark:bg-primary-900/30 rounded-xl flex items-center justify-center mx-auto mb-5">
                        <Zap className="text-primary-600 dark:text-primary-400" size={28} />
                      </div>
                      <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">{t('home.empty.title')}</h3>
                      <p className="text-sm text-slate-500 dark:text-slate-400 mb-6 max-w-sm mx-auto">{t('home.empty.subtitle')}</p>
                      <div className="flex items-center justify-center gap-3 flex-wrap">
                        <button onClick={() => setShowAddModal(true)} className="px-6 py-3 bg-primary-600 text-white rounded-xl font-medium shadow-md hover:bg-primary-500 transition-all inline-flex items-center gap-2">
                          <Plus size={18} /> {t('home.empty.create')}
                        </button>
                        <button onClick={() => importInputRef.current?.click()} disabled={isImporting} className="px-6 py-3 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 rounded-xl font-medium hover:bg-slate-50 dark:hover:bg-slate-700 transition-all inline-flex items-center gap-2 disabled:opacity-50">
                          {isImporting ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />} {t('home.empty.import')}
                        </button>
                      </div>
                    </div>
                    {/* Template starter cards */}
                    <div>
                      <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">{t('home.templates.title')}</h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {INSTRUCTION_TEMPLATES.slice(0, 4).map((tmpl, i) => (
                          <button
                            key={i}
                            onClick={() => {
                              setNewAsstConfig({ name: '', description: '', instructions: tmpl.instructions });
                              setShowAddModal(true);
                              setWizardStep(0);
                            }}
                            className="text-left bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3.5 hover:border-primary-300 dark:hover:border-primary-500/40 hover:shadow-md transition-all group"
                          >
                            <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 group-hover:text-primary-600 dark:group-hover:text-primary-400 mb-1">{t(tmpl.key)}</p>
                            <p className="text-xs text-slate-500 dark:text-slate-400">{t(tmpl.key + '.desc')}</p>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Right: Quick actions panel */}
                  <div className="lg:w-64 shrink-0 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5">
                    <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                      <Zap size={14} /> {t('home.getStarted')}
                    </h3>
                    <ul className="space-y-2 text-sm text-slate-600 dark:text-slate-400">
                      <li className="flex items-start gap-2"><CheckCircle2 size={15} className="text-emerald-500 shrink-0 mt-0.5" /> {t('home.getStarted.1')}</li>
                      <li className="flex items-start gap-2"><CheckCircle2 size={15} className="text-emerald-500 shrink-0 mt-0.5" /> {t('home.getStarted.2')}</li>
                      <li className="flex items-start gap-2"><CheckCircle2 size={15} className="text-emerald-500 shrink-0 mt-0.5" /> {t('home.getStarted.3')}</li>
                      <li className="flex items-start gap-2"><CheckCircle2 size={15} className="text-emerald-500 shrink-0 mt-0.5" /> {t('home.getStarted.4')}</li>
                    </ul>
                  </div>
                </div>
              )}

            </div>

            <div className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-5 md:px-8 py-3 flex items-center justify-between text-xs text-slate-400 shrink-0">
              <span>{t('home.footer.version')}</span>
              <a href="https://github.com/lucianciusa/rag-document-chat-assistant" target="_blank" rel="noopener noreferrer" className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-all flex items-center gap-1.5" title="View Source on GitHub">
                <Github size={16} />
              </a>
            </div>
          </div>
        )}
      </main>

      {/* EDIT MODAL */}
      {showEditModal && (
        <div className="fixed inset-0 bg-slate-50/60 dark:bg-slate-950/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-lg shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-950/50">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{t('edit.title')}</h2>
              <button onClick={() => {
                if (generatingAssistantId === editAsstConfig?.id) {
                  setShowCancelAvatarModal(true);
                } else {
                  setShowEditModal(false);
                }
              }} className="text-slate-500 hover:text-slate-600 dark:text-slate-400 rounded-lg p-1 hover:bg-slate-100 dark:bg-slate-800"><X size={20} /></button>
            </div>
            <form onSubmit={handleUpdateAssistant} className="p-6 space-y-5 pb-12 max-h-[70vh] overflow-y-auto">
              {/* Avatar Section */}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">{t('edit.avatar')}</label>
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0 border border-slate-200 dark:border-slate-700">
                    {editAsstImageUrl ? (
                      <img src={editAsstImageUrl} alt="Preview" className="w-full h-full object-cover cursor-pointer hover:opacity-80 transition-opacity" onClick={() => setPreviewImageUrl(editAsstImageUrl)} />
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
                        <ImageIcon size={14} /> {t('edit.avatar.upload')}
                      </button>
                      <button type="button" onClick={() => handleGenerateAvatar(editAsstConfig.id)} disabled={generatingAssistantId !== null} className={`px-3 py-1.5 text-xs font-medium bg-primary-50 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 rounded-lg transition-colors flex items-center gap-1.5 ${generatingAssistantId !== null ? 'opacity-50 cursor-not-allowed' : 'hover:bg-primary-100 dark:hover:bg-primary-900/50'}`}>
                        {generatingAssistantId === editAsstConfig.id ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} {t('edit.avatar.generate')}
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
                        {t('edit.avatar.remove')}
                      </button>
                    )}
                  </div>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('edit.name')} <span className="text-red-500">*</span></label>
                <input required type="text" value={editAsstConfig.name} onChange={e => setEditAsstConfig({ ...editAsstConfig, name: e.target.value })} placeholder={t('edit.name.placeholder')} className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white rounded-lg outline-none focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('edit.description')}</label>
                <input type="text" value={editAsstConfig.description} onChange={e => setEditAsstConfig({ ...editAsstConfig, description: e.target.value })} placeholder={t('edit.description.placeholder')} className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white rounded-lg outline-none focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500" />
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">{t('edit.instructions')} <span className="text-red-500">*</span></label>
                  <div className="flex items-center gap-3 relative snippets-menu-container">
                    <button 
                      type="button" 
                      onClick={() => handleFormatInstructions('edit')} 
                      disabled={isFormatting || !editAsstConfig.instructions.trim()} 
                      title={t('instructions.format.hint')}
                      className="text-xs text-primary-600 dark:text-primary-400 hover:underline flex items-center gap-1 disabled:opacity-50"
                    >
                      {isFormatting ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                      {isFormatting ? t('instructions.formatting') : t('edit.instructions.format')}
                    </button>
                    <button type="button" onClick={() => setShowSnippets(showSnippets === 'edit' ? null : 'edit')} className="text-xs text-primary-600 dark:text-primary-400 hover:underline flex items-center gap-1"><Plus size={12} /> {t('edit.snippet')}</button>
                    {showSnippets === 'edit' && (
                      <div className="absolute right-0 top-full mt-3 w-72 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg py-1 z-50 text-sm max-h-60 overflow-y-auto">
                        {(() => {
                          const available = SNIPPETS.filter(sn => {
                            const instr = editAsstConfig.instructions.toLowerCase();
                            const literal = sn.text.toLowerCase();
                            if (instr.includes(literal)) return false;
                            const hasKeywords = sn.searchTerms.some(term => instr.includes(term.toLowerCase()));
                            return !hasKeywords;
                          });
                          return (
                            <>
                              {available.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    const toAdd = available.map(sn => sn.text).join('\n\n');
                                    setEditAsstConfig(c => ({ ...c, instructions: (c.instructions ? c.instructions + '\n\n' : '') + toAdd }));
                                    setShowSnippets(null);
                                  }}
                                  className="w-full text-left px-3 py-2 bg-primary-50 dark:bg-primary-500/10 text-primary-600 dark:text-primary-400 font-semibold border-b border-slate-100 dark:border-slate-800 hover:bg-primary-100 dark:hover:bg-primary-500/20 transition-colors"
                                >
                                  {t('snippet.insertAll', { n: String(available.length) })}
                                </button>
                              )}
                              {available.map((sn, i) => (
                                <button key={i} type="button" title={sn.text} onClick={() => { setEditAsstConfig(c => ({ ...c, instructions: (c.instructions ? c.instructions + '\n\n' : '') + sn.text })); setShowSnippets(null); }} className="w-full text-left px-3 py-2 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 transition-colors group border-b border-slate-50 dark:border-slate-800/50 last:border-0">
                                  <div className="font-medium text-xs text-slate-900 dark:text-white group-hover:text-primary-600 dark:group-hover:text-primary-400">{t(sn.key)}</div>
                                  <div className="text-[11px] text-slate-500 whitespace-pre-wrap line-clamp-2">{t(sn.key + '.desc')}</div>
                                </button>
                              ))}
                              {available.length === 0 && <div className="px-3 py-4 text-center text-xs text-slate-400 italic">{t('snippet.allAdded')}</div>}
                            </>
                          );
                        })()}
                      </div>
                    )}
                  </div>
                </div>
                <p className="text-[11px] text-slate-500 mb-2">{t('edit.instructions.hint')}</p>
                <textarea required value={editAsstConfig.instructions} onChange={e => setEditAsstConfig({ ...editAsstConfig, instructions: e.target.value })} rows={5} className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white rounded-lg outline-none focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500 font-mono text-sm leading-relaxed" />
              </div>
              <div className="pt-2 flex justify-end gap-3">
                <button type="button" onClick={() => {
                  if (generatingAssistantId === editAsstConfig?.id) {
                    setShowCancelAvatarModal(true);
                  } else {
                    discardPendingEdits(editAsstConfig.id);
                  }
                }} className="px-5 py-2.5 text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors">{t('edit.cancel')}</button>
                <button type="submit" disabled={!editAsstConfig.name || !editAsstConfig.instructions} className="px-5 py-2.5 text-sm font-medium bg-primary-600 text-white rounded-lg hover:bg-primary-500 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm transition-all">{t('edit.save')}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CREATION WIZARD */}
      {showAddModal && (() => {
        const wizardSteps = [
          { label: t('wizard.step.basics'), icon: <Briefcase size={16} /> },
          { label: t('wizard.step.instructions'), icon: <Cpu size={16} /> },
          { label: t('wizard.step.avatar'), icon: <ImageIcon size={16} /> },
          { label: t('wizard.step.knowledge'), icon: <BookOpen size={16} /> },
          { label: t('wizard.step.review'), icon: <Check size={16} /> },
        ];
        const BLOCKED_EXTS = ['.png', '.jpg', '.jpeg', '.bmp', '.pptx'];
        const addWizardDocs = (files: FileList | null) => {
          if (!files) return;
          const valid = Array.from(files).filter(f => {
            const ext = '.' + f.name.split('.').pop()?.toLowerCase();
            return !BLOCKED_EXTS.includes(ext);
          });
          setPendingDocs(prev => {
            const names = new Set(prev.map(f => f.name));
            return [...prev, ...valid.filter(f => !names.has(f.name))];
          });
        };
        const instructionTemplates = INSTRUCTION_TEMPLATES;
        const canProceed = wizardStep === 0 ? !!newAsstConfig.name.trim() : wizardStep === 1 ? !!newAsstConfig.instructions.trim() : true;
        const closeWizard = () => { setShowAddModal(false); setWizardStep(0); setNewAsstImage(null); setPendingDocs([]); };
        return (
          <div className="fixed inset-0 bg-slate-50/60 dark:bg-slate-950/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
            <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[85vh]">
              {/* Header with step indicator */}
              <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50 shrink-0">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{t('wizard.title')}</h2>
                  <button onClick={closeWizard} className="text-slate-500 hover:text-slate-600 dark:text-slate-400 rounded-lg p-1 hover:bg-slate-100 dark:hover:bg-slate-800"><X size={20} /></button>
                </div>
                {/* Step indicators */}
                <div className="flex items-center gap-1">
                  {wizardSteps.map((s, i) => (
                    <React.Fragment key={i}>
                      <button
                        onClick={() => { if (i < wizardStep) setWizardStep(i); }}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${i === wizardStep
                          ? 'bg-primary-100 dark:bg-primary-500/20 text-primary-700 dark:text-primary-300 shadow-sm'
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
                      <h3 className="text-base font-semibold text-slate-900 dark:text-white mb-1">{t('wizard.basics.title')}</h3>
                      <p className="text-sm text-slate-500 dark:text-slate-400 mb-5">{t('wizard.basics.hint')}</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('wizard.basics.name')} <span className="text-red-500">*</span></label>
                      <input autoFocus type="text" value={newAsstConfig.name} onChange={e => setNewAsstConfig({ ...newAsstConfig, name: e.target.value })} placeholder={t('wizard.basics.name.placeholder')} className="w-full px-4 py-2.5 border border-slate-300 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('wizard.basics.description')} <span className="text-xs text-slate-400 font-normal">{t('wizard.basics.description.optional')}</span></label>
                      <textarea value={newAsstConfig.description} onChange={e => setNewAsstConfig({ ...newAsstConfig, description: e.target.value })} rows={3} placeholder={t('wizard.basics.description.placeholder')} className="w-full px-4 py-2.5 border border-slate-300 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white text-sm leading-relaxed" />
                    </div>
                  </div>
                )}

                {/* STEP 1: Instructions */}
                {wizardStep === 1 && (
                  <div className="space-y-5 animate-in fade-in duration-200">
                    <div>
                      <h3 className="text-base font-semibold text-slate-900 dark:text-white mb-1">{t('wizard.instructions.title')}</h3>
                      <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">{t('wizard.instructions.hint')}</p>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {[<Lightbulb size={16} />, <Scale size={16} />, <Code size={16} />, <HeartPulse size={16} />, <GraduationCap size={16} />, <ShieldCheck size={16} />].map((icon, i) => {
                        const tmpl = instructionTemplates[i];
                        return (
                          <button
                            key={i}
                            type="button"
                            onClick={() => {
                              if (selectedTemplate === tmpl.key) return;
                              setNewAsstConfig({ ...newAsstConfig, instructions: tmpl.instructions });
                              setSelectedTemplate(tmpl.key);
                            }}
                            className={`text-left px-3 py-2.5 rounded-xl border text-xs font-medium transition-all flex items-center gap-2 ${selectedTemplate === tmpl.key
                              ? 'border-primary-400 dark:border-primary-500 bg-primary-50 dark:bg-primary-500/10 text-primary-700 dark:text-primary-300 shadow-sm ring-1 ring-primary-200 dark:ring-primary-500/30'
                              : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                              }`}
                          >
                            {icon} {t(tmpl.key)}
                          </button>
                        );
                      })}
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">{t('wizard.instructions.label')} <span className="text-red-500">*</span></label>
                        <div className="flex items-center gap-3 relative snippets-menu-container">
                          <button 
                            type="button" 
                            onClick={() => handleFormatInstructions('wizard')} 
                            disabled={isFormatting || !newAsstConfig.instructions.trim()} 
                            title={t('instructions.format.hint')}
                            className="text-xs text-primary-600 dark:text-primary-400 hover:underline flex items-center gap-1 disabled:opacity-50"
                          >
                            {isFormatting ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                            {isFormatting ? t('instructions.formatting') : t('instructions.format')}
                          </button>
                          <button type="button" onClick={() => setShowSnippets(showSnippets === 'create' ? null : 'create')} className="text-xs text-primary-600 dark:text-primary-400 hover:underline flex items-center gap-1"><Plus size={12} /> {t('wizard.instructions.snippet')}</button>
                          {showSnippets === 'create' && (
                            <div className="absolute right-0 top-full mt-2.5 w-72 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg py-1 z-50 text-sm max-h-60 overflow-y-auto mb-4">
                              {(() => {
                                const available = SNIPPETS.filter(sn => {
                                  const instr = newAsstConfig.instructions.toLowerCase();
                                  const literal = sn.text.toLowerCase();
                                  if (instr.includes(literal)) return false;
                                  const hasKeywords = sn.searchTerms.some(term => instr.includes(term.toLowerCase()));
                                  return !hasKeywords;
                                });
                                return (
                                  <>
                                    {available.length > 1 && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const toAdd = available.map(sn => sn.text).join('\n\n');
                                          setNewAsstConfig(c => ({ ...c, instructions: (c.instructions ? c.instructions + '\n\n' : '') + toAdd }));
                                          setShowSnippets(null);
                                        }}
                                        className="w-full text-left px-3 py-2 bg-primary-50 dark:bg-primary-500/10 text-primary-600 dark:text-primary-400 font-semibold border-b border-slate-100 dark:border-slate-800 hover:bg-primary-100 dark:hover:bg-primary-500/20 transition-colors"
                                      >
                                        {t('snippet.insertAll', { n: String(available.length) })}
                                      </button>
                                    )}
                                    {available.map((sn, i) => (
                                      <button key={i} type="button" onClick={() => { setNewAsstConfig(c => ({ ...c, instructions: (c.instructions ? c.instructions + '\n\n' : '') + sn.text })); setShowSnippets(null); }} className="w-full text-left px-3 py-2 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 transition-colors border-b border-slate-50 dark:border-slate-800/50 last:border-0">
                                        <div className="font-medium text-xs text-slate-900 dark:text-white">{t(sn.key)}</div>
                                        <div className="text-[11px] text-slate-500 whitespace-pre-wrap">{t(sn.key + '.desc')}</div>
                                      </button>
                                    ))}
                                    {available.length === 0 && <div className="px-3 py-4 text-center text-xs text-slate-400 italic">{t('snippet.allAdded')}</div>}
                                  </>
                                );
                              })()}
                            </div>
                          )}
                        </div>
                      </div>
                      <textarea value={newAsstConfig.instructions} onChange={e => setNewAsstConfig({ ...newAsstConfig, instructions: e.target.value })} rows={6} className="w-full px-4 py-3 border border-slate-300 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500 font-mono text-sm leading-relaxed bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white" />
                    </div>
                  </div>
                )}

                {/* STEP 2: Avatar */}
                {wizardStep === 2 && (
                  <div className="space-y-5 animate-in fade-in duration-200">
                    <div>
                      <h3 className="text-base font-semibold text-slate-900 dark:text-white mb-1">{t('wizard.avatar.title')}</h3>
                      <p className="text-sm text-slate-500 dark:text-slate-400 mb-5">{t('wizard.avatar.hint')}</p>
                    </div>
                    <div className="flex flex-col items-center gap-4">
                      <div className="w-28 h-28 rounded-2xl overflow-hidden bg-slate-100 dark:bg-slate-800 flex items-center justify-center border-2 border-dashed border-slate-300 dark:border-slate-600">
                        {newAsstImageUrl ? (
                          <img src={newAsstImageUrl} alt="Preview" className="w-full h-full object-cover cursor-pointer hover:opacity-80 transition-opacity" onClick={() => setPreviewImageUrl(newAsstImageUrl)} />
                        ) : (
                          <Bot size={40} className="text-slate-400" />
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        <input type="file" ref={newAvatarInputRef} accept="image/*" className="hidden" onChange={e => { if (e.target.files?.[0]) setNewAsstImage(e.target.files[0]); }} />
                        <button type="button" onClick={() => newAvatarInputRef.current?.click()} className="px-4 py-2 text-sm font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition-colors flex items-center gap-2">
                          <ImageIcon size={16} /> {t('wizard.avatar.upload')}
                        </button>
                        {newAsstImage && (
                          <button type="button" onClick={() => setNewAsstImage(null)} className="px-4 py-2 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-xl transition-colors">
                            {t('wizard.avatar.remove')}
                          </button>
                        )}
                      </div>
                      <p className="text-xs text-slate-400 text-center">{t('wizard.avatar.aiLater')}</p>
                    </div>
                  </div>
                )}

                {/* STEP 3: Knowledge */}
                {wizardStep === 3 && (
                  <div className="space-y-5 animate-in fade-in duration-200">
                    <input
                      type="file"
                      ref={wizardDocInputRef}
                      multiple
                      accept=".pdf,.docx,.txt,.md,.csv"
                      className="hidden"
                      onChange={e => addWizardDocs(e.target.files)}
                    />
                    <div>
                      <h3 className="text-base font-semibold text-slate-900 dark:text-white mb-1">{t('wizard.knowledge.title')}</h3>
                      <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">{t('wizard.knowledge.hint')}</p>
                    </div>
                    <div
                      onDragOver={e => { e.preventDefault(); setWizardDragOver(true); }}
                      onDragLeave={() => setWizardDragOver(false)}
                      onDrop={e => { e.preventDefault(); setWizardDragOver(false); addWizardDocs(e.dataTransfer.files); }}
                      onClick={() => wizardDocInputRef.current?.click()}
                      className={`border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center gap-3 cursor-pointer transition-colors ${wizardDragOver ? 'border-primary-400 bg-primary-50 dark:bg-primary-900/20' : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800/30'}`}
                    >
                      <Upload size={28} className={wizardDragOver ? 'text-primary-500' : 'text-slate-400'} />
                      <div className="text-center">
                        <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{t('wizard.knowledge.dropzone')}</p>
                        <p className="text-xs text-slate-400 mt-1">{t('wizard.knowledge.formats')}</p>
                      </div>
                    </div>
                    {pendingDocs.length > 0 && (
                      <ul className="space-y-2">
                        {pendingDocs.map((f, i) => (
                          <li key={i} className="flex items-center gap-3 px-3 py-2.5 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
                            <FileText size={16} className="text-slate-400 shrink-0" />
                            <span className="text-sm text-slate-700 dark:text-slate-300 truncate flex-1">{f.name}</span>
                            <span className="text-xs text-slate-400 shrink-0">{(f.size / 1024).toFixed(0)} KB</span>
                            <button type="button" onClick={e => { e.stopPropagation(); setPendingDocs(prev => prev.filter((_, j) => j !== i)); }} className="text-slate-400 hover:text-red-500 transition-colors shrink-0">
                              <X size={14} />
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                    {pendingDocs.length === 0 && (
                      <p className="text-center text-xs text-slate-400">{t('wizard.knowledge.empty')}</p>
                    )}
                  </div>
                )}

                {/* STEP 4: Review */}
                {wizardStep === 4 && (
                  <div className="space-y-5 animate-in fade-in duration-200">
                    <div>
                      <h3 className="text-base font-semibold text-slate-900 dark:text-white mb-1">{t('wizard.review.title')}</h3>
                      <p className="text-sm text-slate-500 dark:text-slate-400 mb-5">{t('wizard.review.hint')}</p>
                    </div>
                    <div className="bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800 divide-y divide-slate-200 dark:divide-slate-800">
                      <div className="flex items-center gap-4 p-4">
                        <div className="w-14 h-14 rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0 border border-slate-200 dark:border-slate-700">
                          {newAsstImageUrl ? (
                            <img src={newAsstImageUrl} alt="Avatar" className="w-full h-full object-cover" />
                          ) : (
                            <Bot size={24} className="text-slate-400" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <h4 className="text-base font-semibold text-slate-900 dark:text-white truncate">{newAsstConfig.name}</h4>
                          <p className="text-sm text-slate-500 dark:text-slate-400 truncate">{newAsstConfig.description || t('wizard.review.noDescription')}</p>
                        </div>
                        <button type="button" onClick={() => setWizardStep(0)} className="ml-auto text-xs text-primary-600 dark:text-primary-400 hover:underline shrink-0">{t('wizard.review.edit')}</button>
                      </div>
                      <div className="p-4">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">{t('wizard.review.instructions')}</span>
                          <button type="button" onClick={() => setWizardStep(1)} className="text-xs text-primary-600 dark:text-primary-400 hover:underline">{t('wizard.review.edit')}</button>
                        </div>
                        <pre className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap font-mono leading-relaxed bg-white dark:bg-slate-900 rounded-lg p-3 border border-slate-100 dark:border-slate-800 max-h-40 overflow-y-auto">{newAsstConfig.instructions}</pre>
                      </div>
                      <div className="p-4">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">{t('wizard.review.kb')}</span>
                          <button type="button" onClick={() => setWizardStep(3)} className="text-xs text-primary-600 dark:text-primary-400 hover:underline">{t('wizard.review.edit')}</button>
                        </div>
                        {pendingDocs.length > 0 ? (
                          <p className="text-sm text-slate-700 dark:text-slate-300 mt-2">{t('wizard.review.docs', { n: pendingDocs.length, s: pendingDocs.length > 1 ? 's' : '' })}</p>
                        ) : (
                          <p className="text-sm text-slate-400 mt-2">{t('wizard.review.noDocs')}</p>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Footer with navigation */}
              <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50 flex items-center justify-between shrink-0">
                <button type="button" onClick={() => { if (wizardStep === 0) { closeWizard(); } else setWizardStep(wizardStep - 1); }} className="px-4 py-2.5 text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition-colors flex items-center gap-1.5">
                  <ChevronLeft size={16} /> {wizardStep === 0 ? t('wizard.cancel') : t('wizard.back')}
                </button>
                {wizardStep < 4 ? (
                  <button type="button" disabled={!canProceed} onClick={() => setWizardStep(wizardStep + 1)} className="px-5 py-2.5 text-sm font-medium bg-primary-600 text-white rounded-xl hover:bg-primary-500 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm transition-all flex items-center gap-1.5">
                    {t('wizard.next')} <ChevronRight size={16} />
                  </button>
                ) : (
                  <button type="button" onClick={(e) => handleCreateAssistant(e)} disabled={!newAsstConfig.name || !newAsstConfig.instructions} className="px-5 py-2.5 text-sm font-medium bg-emerald-600 text-white rounded-xl hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm transition-all flex items-center gap-1.5">
                    {t('wizard.launch')}
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
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">{t('delete.assistant.title')}</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-6">{t('delete.assistant.message', { name: assistantToDelete.name })}</p>
            <div className="flex justify-center gap-3">
              <button
                onClick={() => setAssistantToDelete(null)}
                className="px-5 py-2.5 text-sm font-medium text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors"
              >
                {t('delete.cancel')}
              </button>
              <button
                onClick={confirmDeleteAssistant}
                className="px-5 py-2.5 text-sm font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors shadow-sm"
              >
                {t('delete.confirm')}
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
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">{t('delete.session.title')}</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-6">{t('delete.session.message', { title: sessionToDelete.title || t('session.default') })}</p>
            <div className="flex justify-center gap-3">
              <button
                onClick={() => setSessionToDelete(null)}
                className="px-5 py-2.5 text-sm font-medium text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors"
              >
                {t('delete.cancel')}
              </button>
              <button
                onClick={confirmDeleteSession}
                className="px-5 py-2.5 text-sm font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors shadow-sm"
              >
                {t('delete.confirm')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CLEAR SESSION MESSAGES CONFIRMATION MODAL */}
      {sessionToClear && (
        <div className="fixed inset-0 bg-slate-50/60 dark:bg-slate-950/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-sm shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden p-6 text-center">
            <Eraser size={48} className="mx-auto text-amber-500 mb-4" />
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">{t('clear.session.title')}</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-6">{t('clear.session.message', { title: sessionToClear.title || t('session.default') })}</p>
            <div className="flex justify-center gap-3">
              <button
                onClick={() => setSessionToClear(null)}
                className="px-5 py-2.5 text-sm font-medium text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors"
              >
                {t('delete.cancel')}
              </button>
              <button
                onClick={confirmClearSession}
                className="px-5 py-2.5 text-sm font-medium bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-colors shadow-sm"
              >
                {t('clear.session.confirm')}
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
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">{t('delete.document.title')}</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-6">{t('delete.document.message', { filename: documentToDelete.filename })}</p>
            <div className="flex justify-center gap-3">
              <button
                onClick={() => setDocumentToDelete(null)}
                className="px-5 py-2.5 text-sm font-medium text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors"
              >
                {t('delete.cancel')}
              </button>
              <button
                onClick={confirmDeleteDocument}
                className="px-5 py-2.5 text-sm font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors shadow-sm"
              >
                {t('delete.confirm')}
              </button>
            </div>
          </div>
        </div>
      )}

      {showCancelAvatarModal && (
        <div className="fixed inset-0 bg-slate-900/40 dark:bg-slate-950/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-md shadow-2xl border border-slate-200 dark:border-slate-800 p-6">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">{t('avatar.modal.title')}</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-6 leading-relaxed">
              {t('avatar.modal.message')}
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
                {t('avatar.modal.cancel')}
              </button>
              <button
                onClick={() => {
                  setShowCancelAvatarModal(false);
                  setShowEditModal(false);
                }}
                className="w-full px-4 py-2.5 bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg font-medium text-sm transition-colors text-left"
              >
                {t('avatar.modal.background')}
              </button>
              <button
                onClick={() => setShowCancelAvatarModal(false)}
                className="w-full px-4 py-2.5 bg-primary-600 text-white hover:bg-primary-500 rounded-lg font-medium text-sm transition-colors text-center mt-2"
              >
                {t('avatar.modal.resume')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SAVE WHILE GENERATING MODAL */}
      {showSaveWhileGeneratingModal && (
        <div className="fixed inset-0 bg-slate-900/40 dark:bg-slate-950/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-sm shadow-2xl border border-slate-200 dark:border-slate-800 p-6 text-center">
            <Loader2 size={40} className="mx-auto text-primary-500 animate-spin mb-4" />
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">{t('avatar.saving.title')}</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-6 leading-relaxed">
              {t('avatar.saving.message')}
            </p>
            <button
              onClick={() => setShowSaveWhileGeneratingModal(false)}
              className="w-full px-4 py-2.5 bg-primary-600 text-white hover:bg-primary-500 rounded-lg font-medium text-sm transition-colors"
            >
              {t('avatar.saving.back')}
            </button>
          </div>
        </div>
      )}

      {/* DOCUMENT FILE PREVIEWER MODAL */}
      {previewDoc && (
        <div className="fixed inset-0 bg-slate-900/60 dark:bg-slate-950/70 backdrop-blur-sm z-[250] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-4xl max-h-[90vh] shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden preview-modal-content">
            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-950/50 shrink-0">
              <div className="flex items-center gap-3 overflow-hidden">
                <div className="p-2 bg-primary-50 dark:bg-primary-500/10 rounded-lg">
                  <FileText size={18} className="text-primary-500" />
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
                    <Loader2 size={32} className="animate-spin text-primary-500" />
                    <span className="text-sm text-slate-500">{t('preview.loading')}</span>
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
                <div className="p-6 md:p-8 prose dark:prose-invert prose-slate max-w-none prose-p:leading-relaxed prose-pre:bg-slate-50 dark:prose-pre:bg-slate-950 prose-pre:border prose-pre:border-slate-200 dark:prose-pre:border-slate-800 prose-code:text-primary-600 dark:prose-code:text-primary-300 prose-headings:text-slate-900 dark:prose-headings:text-white">
                  {previewContent.highlightText && (
                    <div className="mb-6 p-4 bg-primary-50 dark:bg-primary-500/10 border border-primary-100 dark:border-primary-500/20 rounded-xl flex items-start gap-3">
                      <Sparkles size={18} className="text-primary-500 shrink-0 mt-0.5" />
                      <div className="text-sm text-slate-700 dark:text-slate-300">
                        <span className="font-semibold text-primary-600 dark:text-primary-400">Grounded Preview:</span> We've highlighted the passages used by the assistant to answer your question.
                      </div>
                    </div>
                  )}
                  <HighlightedText text={previewContent.content || ''} highlight={previewContent.highlightText} isMarkdown={true} />
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
                <div className="flex flex-col h-full">
                  {previewContent.highlightText && (
                    <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border-b border-amber-100 dark:border-amber-900/30 flex items-start gap-3">
                      <Quote size={18} className="text-amber-500 shrink-0 mt-0.5" />
                      <div className="text-sm text-amber-900 dark:text-amber-200">
                        <span className="font-semibold">Used in Answer:</span> "{previewContent.highlightText.split('\n\n---\n\n')[0]}..."
                        <p className="text-xs mt-1 opacity-80">PDF highlighting is limited; refer to the snippet above for the exact grounded passage.</p>
                      </div>
                    </div>
                  )}
                  <iframe src={previewContent.blobUrl} className="w-full h-[75vh]" title="PDF Preview" />
                </div>
              ) : previewContent?.type === 'image' ? (
                <div className="flex items-center justify-center p-8 bg-slate-50 dark:bg-slate-950">
                  <img src={previewContent.blobUrl} alt={previewContent.filename} className="max-w-full max-h-[70vh] object-contain rounded-lg shadow-lg" />
                </div>
              ) : previewContent?.type === 'snippet' ? (
                <div className="p-6 md:p-8">
                  <div className="bg-primary-50 dark:bg-primary-500/5 rounded-xl border border-primary-100 dark:border-primary-500/20 p-6">
                    <div className="text-[10px] font-bold text-primary-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                      <Quote size={12} /> {t('preview.snippet.label')}
                    </div>
                    <p className="text-base text-slate-800 dark:text-slate-200 italic leading-relaxed font-serif">
                      "{previewContent.content}"
                    </p>
                    <div className="mt-6 flex justify-end">
                      <button
                        onClick={() => {
                          setPreviewContent(null);
                          handlePreviewDocument({ id: previewDoc.id, filename: previewDoc.filename });
                        }}
                        className="text-xs font-medium text-primary-600 dark:text-primary-400 hover:underline"
                      >
                        {t('preview.snippet.viewFull')}
                      </button>
                    </div>
                  </div>
                </div>
              ) : previewContent ? (
                <div className="p-6">
                  {previewContent.highlightText && (
                    <div className="mb-4 p-3 bg-primary-50 dark:bg-primary-500/10 border border-primary-100 dark:border-primary-500/20 rounded-xl flex items-center gap-2">
                      <Sparkles size={14} className="text-primary-500" />
                      <div className="text-xs text-slate-700 dark:text-slate-300 font-medium">
                        Found matching passages in document. Scrolled to first match.
                      </div>
                    </div>
                  )}
                  <div className="bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800 p-5 overflow-auto max-h-[65vh]">
                    <HighlightedText text={previewContent.content || ''} highlight={previewContent.highlightText} isMarkdown={false} />
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {/* ASSISTANT DETAILS MODAL */}
      {showAssistantDetails && selectedAssistant && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4 animate-in fade-in duration-200" onClick={() => setShowAssistantDetails(false)}>
          <div className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden animate-in zoom-in-95 duration-200" onClick={(e) => e.stopPropagation()}>
            <div className="relative h-32 bg-gradient-to-r from-primary-600 to-primary-400 dark:from-primary-900 dark:to-primary-700">
              <button onClick={() => setShowAssistantDetails(false)} className="absolute top-4 right-4 p-2 bg-black/10 hover:bg-black/20 text-white rounded-full transition-colors backdrop-blur-md">
                <X size={20} />
              </button>
            </div>
            <div className="px-8 pb-10 -mt-16">
              <div className="relative">
                <div className="w-32 h-32 rounded-3xl overflow-hidden border-4 border-white dark:border-slate-900 shadow-xl bg-white dark:bg-slate-800 flex items-center justify-center">
                  {selectedAssistant.image_url ? (
                    <img src={selectedAssistant.image_url} alt={selectedAssistant.name} className="w-full h-full object-cover" />
                  ) : (
                    <Bot size={48} className="text-primary-500" />
                  )}
                </div>
              </div>

              <div className="mt-6 space-y-4">
                <div>
                  <h3 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">{selectedAssistant.name}</h3>
                  <div className="mt-1 flex items-center gap-2">
                    <span className="px-2 py-0.5 bg-primary-100 dark:bg-primary-500/20 text-primary-700 dark:text-primary-300 text-[10px] font-bold uppercase tracking-wider rounded-md">
                      {t('assistant.details.profile')}
                    </span>
                  </div>
                </div>

                {selectedAssistant.description ? (
                  <div className="pt-2">
                    <h4 className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2">{t('edit.description')}</h4>
                    <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                      {selectedAssistant.description}
                    </p>
                  </div>
                ) : (
                  <p className="text-slate-400 dark:text-slate-500 italic text-sm pt-2">
                    {t('home.assistant.noDescription')}
                  </p>
                )}

                <div className="pt-6 flex justify-end">
                  <button
                    onClick={() => setShowAssistantDetails(false)}
                    className="px-6 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl font-semibold transition-colors"
                  >
                    {t('import.modal.confirm')}
                  </button>
                </div>
              </div>
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
                placeholder={t('chat.search.placeholder')}
                className="flex-1 bg-transparent outline-none text-sm text-slate-900 dark:text-white placeholder-slate-400"
              />
              <button onClick={() => setChatSearchOpen(false)} className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded"><X size={16} /></button>
            </div>
            <div className="max-h-[60vh] overflow-y-auto">
              {chatSearchQuery.trim() === '' ? (
                <div className="p-6 text-center text-sm text-slate-500">{t('chat.search.empty')}</div>
              ) : chatSearchResults.length === 0 ? (
                <div className="p-6 text-center text-sm text-slate-500">{t('chat.search.noResults')}</div>
              ) : (
                <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                  {chatSearchResults.map(r => (
                    <li
                      key={r.id}
                      onClick={() => {
                        setChatSearchOpen(false);
                        setTimeout(() => {
                          const el = document.getElementById(`message-${r.id}`);
                          if (el) {
                            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            el.classList.add('ring-4', 'ring-primary-500/30', 'bg-primary-50/50', 'dark:bg-primary-500/10');
                            setTimeout(() => el.classList.remove('ring-4', 'ring-primary-500/30', 'bg-primary-50/50', 'dark:bg-primary-500/10'), 2000);
                          }
                        }, 100);
                      }}
                      className="px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/60 cursor-pointer transition-colors"
                    >
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

      {/* IMPORT STRUCTURE INFO MODAL */}
      {showImportInfo && (
        <div
          className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[200] flex items-center justify-center p-4"
          onClick={() => setShowImportInfo(false)}
        >
          <div
            className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-md shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden animate-in zoom-in-95 duration-200"
            onClick={e => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-950/50">
              <h3 className="font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                <Info size={18} className="text-primary-500" /> {t('import.modal.title')}
              </h3>
              <button onClick={() => setShowImportInfo(false)} className="text-slate-500 hover:text-slate-700 dark:hover:text-slate-300">
                <X size={18} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-slate-600 dark:text-slate-400">
                {t('import.modal.description')}
              </p>
              <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3 font-mono text-[11px] leading-relaxed border border-slate-200 dark:border-slate-700">
                <div className="text-primary-600 dark:text-primary-400">assistant_name.zip/</div>
                <div className="ml-4 flex items-center gap-1.5"><FileText size={12} className="text-slate-400" /> manifest.json <span className="text-slate-400 italic">({t('import.modal.required')})</span></div>
                <div className="ml-4 flex items-center gap-1.5"><Folder size={12} className="text-slate-400" /> avatar/ <span className="text-slate-400 italic">({t('import.modal.optional')})</span></div>
                <div className="ml-8 text-slate-500">custom_avatar.png</div>
                <div className="ml-4 flex items-center gap-1.5"><Folder size={12} className="text-slate-400" /> documents/ <span className="text-slate-400 italic">({t('import.modal.optional')})</span></div>
                <div className="ml-8 text-slate-500">file1.pdf</div>
                <div className="ml-8 text-slate-500">file2.docx</div>
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 space-y-1 bg-slate-50 dark:bg-slate-800/30 p-2.5 rounded-lg border border-slate-200/60 dark:border-slate-700/60">
                <p>• <strong className="text-slate-700 dark:text-slate-300">manifest.json</strong>: {t('import.modal.manifest.hint')}</p>
                <div className="bg-slate-100 dark:bg-slate-900/50 p-2 rounded mt-1 mb-2 font-mono text-[9px] text-slate-600 dark:text-slate-400 overflow-x-auto">
                  {`{
  "schema_version": 1,
  "name": "Assistant Name",
  "instructions": "...",
  "image_filename": "avatar.png",
  "documents": [{"filename": "doc.pdf"}]
}`}
                </div>
                <p>• <strong className="text-slate-700 dark:text-slate-300">documents/</strong>: {t('import.modal.documents.hint')}</p>
                <p>• <strong className="text-slate-700 dark:text-slate-300">avatar/</strong>: {t('import.modal.avatar.hint')}</p>
              </div>
              <button
                onClick={() => setShowImportInfo(false)}
                className="w-full py-2.5 bg-primary-600 hover:bg-primary-500 text-white rounded-xl font-medium shadow-md shadow-primary-500/20 transition-colors mt-2"
              >
                {t('import.modal.confirm')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ANIMATED TOAST NOTIFICATION */}
      {creationProgress && (
        <div className="fixed bottom-6 right-6 z-[400] animate-in slide-in-from-bottom-5 fade-in duration-300">
          <div className="px-5 py-4 rounded-xl shadow-xl flex items-center gap-3 border bg-slate-50 dark:bg-slate-800/80 border-slate-200 dark:border-slate-700/50 text-slate-700 dark:text-slate-300 min-w-[260px]">
            <Loader2 size={20} className="text-primary-500 shrink-0 animate-spin" />
            <div className="flex flex-col flex-1 min-w-0">
              <span className="font-semibold text-sm">{t('progress.indexing')}</span>
              <span className="text-xs mt-0.5 text-slate-500 dark:text-slate-400">{t('progress.indexing.detail', { current: creationProgress.current, total: creationProgress.total })}</span>
              <div className="mt-2 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                <div className="h-full bg-primary-500 rounded-full transition-all duration-300" style={{ width: `${(creationProgress.current / creationProgress.total) * 100}%` }} />
              </div>
            </div>
          </div>
        </div>
      )}

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
                className={`ml-2 px-3 py-1.5 text-xs font-semibold rounded-lg shadow-sm border transition-colors ${toastConfig.type === 'success'
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