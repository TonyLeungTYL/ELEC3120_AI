'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  Send,
  Square,
  Image as ImageIcon,
  FileText,
  X,
  Loader2,
  Upload,
  Paperclip,
  Mic,
  MicOff,
  GraduationCap,
  Sparkles,
  Cpu,
  Lightbulb,
  Calculator,
  Sigma,
  Target,
  BookOpen,
  Code2,
  Wand2,
  Globe,
  Brain,
  ChevronDown,
  Layers,
  Network,
  Wifi,
  Route,
  Server,
} from 'lucide-react';
import type { ChatMode } from '@/components/chat-messages';
import { useToast } from '@/hooks/use-toast';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';

interface ChatInputProps {
  onSend: (message: string, hasImage: boolean, hasPdf: boolean, imageData?: string | null, pdfData?: string | null, pdfFileName?: string) => void;
  onStop?: () => void;
  isLoading: boolean;
  language: 'en' | 'zh';
  mode?: ChatMode;
  onModeChange?: (mode: ChatMode) => void;
  /**
   * When true, the next chat request is sent with OpenRouter's `:online`
   * suffix so the model can search the web and return source citations.
   */
  webSearch?: boolean;
  onWebSearchChange?: (next: boolean) => void;
  /**
   * Reasoning effort level for Agent Mode. Maps to OpenRouter's
   * normalised `reasoning.effort` (Gemini → thinkingBudget). Only
   * shown / sent when `mode === "agent"`.
   */
  agentReasoningLevel?: 'low' | 'medium' | 'high';
  onAgentReasoningLevelChange?: (next: 'low' | 'medium' | 'high') => void;
  /**
   * Live model picker for Tutor/Code modes. Whitelisted on the server
   * (`ALLOWED_MODELS` in /api/chat/route.ts).
   */
  selectedModel?: string;
  onSelectedModelChange?: (next: string) => void;
}

/** Curated model picker options. Keep in sync with ALLOWED_MODELS in
 *  src/app/api/chat/route.ts. */
const MODEL_OPTIONS: Array<{
  id: string;
  label: string;
  badge: string;
  hint: { en: string; zh: string };
}> = [
  { id: 'Claude-Opus-4.7', label: 'Claude Opus 4.7', badge: 'Default',
    hint: { en: 'Anthropic flagship · top-tier reasoning + writing (current default).',
            zh: 'Anthropic 旗艦 · 最強推理 + 寫作（目前預設）。' } },
  { id: 'Claude-Sonnet-4.5', label: 'Claude Sonnet 4.5', badge: 'Balanced',
    hint: { en: 'Cheaper Anthropic model — fast, careful, great for everyday answers.',
            zh: 'Anthropic 平價型 — 又快又穩，日常答題最啱。' } },
  { id: 'Gemini-3.1-Pro', label: 'Gemini 3.1 Pro', badge: 'Long',
    hint: { en: 'Google · huge context window, best when feeding long PDFs / chats.',
            zh: 'Google · 超大 context，餵長 PDF 或長對話最啱。' } },
  { id: 'GPT-5', label: 'GPT-5', badge: 'Frontier',
    hint: { en: 'OpenAI frontier — strong on hard, multi-step reasoning.',
            zh: 'OpenAI 前沿 — 多步推理難題最強。' } },
  { id: 'Grok-4', label: 'Grok 4', badge: 'Alt',
    hint: { en: 'xAI alternative — sometimes catches things others miss.',
            zh: 'xAI 另一選擇 — 偶爾會諗到其他 model 遺漏嘅嘢。' } },
  { id: 'DeepSeek-V4', label: 'DeepSeek V4', badge: 'Fast',
    hint: { en: 'Fast + cheap. Good for quick lookups, weaker on long structured answers.',
            zh: '又快又平。適合快速查嘢，長結構答題較弱。' } },
];

const MAX_PDF_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB

function getSupportedMimeType(): string | null {
  if (typeof window === 'undefined') return null;
  const types = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/mp4',
    'audio/wav',
  ];
  for (const type of types) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return null;
}

function formatFileSize(bytes: number): string {
  if (bytes >= 1024 * 1024) {
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }
  return (bytes / 1024).toFixed(1) + ' KB';
}

const quickActions: Array<{
  icon: typeof GraduationCap;
  label: { en: string; zh: string };
  prompt: { en: string; zh: string };
  targetMode?: ChatMode;
  accent?: 'emerald' | 'violet';
}> = [
  {
    icon: FileText,
    label: { en: 'Full Mock Paper', zh: '完整 Mock Paper' },
    prompt: {
      en: 'Please generate ONE complete ELEC 3120 mock final exam paper as a downloadable PDF. Match the real ELEC 3120 final format: cover page, Section A with 21 multiple-choice questions (2 pts each), then Sections B/C/D/E each with ONE figure and 3-5 short numbered sub-questions (simple "Answer: ___" / fill-in-the-blank style — do NOT cram (a)(b)(c) into a single prompt). Total ~100 points, ~3-4 diagrams. Include an Answer Key.',
      zh: '請整一份完整 ELEC 3120 mock final exam PDF。跟番真實 ELEC 3120 final 格式：封面、Section A 21 條 MCQ（每題 2 分），跟住 Section B/C/D/E 每個 section 一張圖 + 3-5 條短 numbered 問題（簡單「Answer: ___」/填空式 — 唔好將 (a)(b)(c) 塞晒入同一條 prompt）。總分 ~100，約 3-4 張圖。要附 Answer Key。',
    },
    targetMode: 'agent',
    accent: 'violet',
  },
  {
    icon: Layers,
    label: { en: 'Paper · Link + Transport', zh: 'Paper · Link + Transport' },
    prompt: {
      en: 'Generate a focused ELEC 3120 practice PDF (Title: "Link Layer + Transport Layer — Structured Questions") covering ONLY Link Layer (L13, L15: MAC, ARP, switching, Ethernet, CSMA/CD) and Transport Layer (L05–L09: UDP, TCP, RDT, congestion control, flow control). Format: 2 sections, each with ONE diagram and exactly 5 structured short-answer sub-questions (10 total — use the incremental PDF builder: pdf_create_draft → pdf_add_section_content → pdf_render_draft, NOT one-shot generate_pdf) (numbered, "Answer: ___" / fill-in / short-explain style — NEVER stack (a)(b)(c) inside one prompt). Mix: definitions, header-field reads, cwnd/RTT calcs, "explain why this packet is dropped" walkthroughs. ~40 points total. Include Answer Key with worked steps.',
      zh: '請整一份 focused ELEC 3120 練習 PDF（標題：「Link Layer + Transport Layer — Structured Questions」），只覆蓋 Link Layer（L13, L15：MAC、ARP、switching、Ethernet、CSMA/CD）同 Transport Layer（L05–L09：UDP、TCP、RDT、congestion control、flow control）。格式：2 個 section，每個 section 一張圖 + 每個 section 5 條 structured 短答題（共 10 條 — 用 incremental PDF builder：pdf_create_draft → pdf_add_section_content → pdf_render_draft，唔好用 one-shot generate_pdf）（numbered、「Answer: ___」/填空/短解式 — 千祈唔好將 (a)(b)(c) 塞入同一條 prompt）。題型混合：定義、header field 解讀、cwnd/RTT 計算、「點解呢個 packet 會 drop」walkthrough。總分 ~40。Answer Key 要連步驟。',
    },
    targetMode: 'agent',
    accent: 'violet',
  },
  {
    icon: Network,
    label: { en: 'Paper · Transport + Network', zh: 'Paper · Transport + Network' },
    prompt: {
      en: 'Generate a focused ELEC 3120 practice PDF (Title: "Transport Layer + Network Layer — Structured Questions") covering ONLY Transport Layer (L05–L09: TCP/UDP, RDT, congestion control) and Network Layer (L10–L14: IP, subnetting/CIDR, forwarding, fragmentation, NAT, ICMP). Format: 2 sections, each with ONE diagram (e.g. TCP timeline, subnet topology) and exactly 5 structured short-answer sub-questions (10 total — use the incremental PDF builder: pdf_create_draft → pdf_add_section_content → pdf_render_draft, NOT one-shot generate_pdf) (numbered, "Answer: ___" / fill-in / short-explain — NEVER stack (a)(b)(c) inside one prompt). Mix: subnet mask calculations, TCP cwnd evolution, "explain forwarding decision" walkthroughs, header-field reads. ~40 points total. Include Answer Key with worked steps.',
      zh: '請整一份 focused ELEC 3120 練習 PDF（標題：「Transport Layer + Network Layer — Structured Questions」），只覆蓋 Transport Layer（L05–L09：TCP/UDP、RDT、congestion control）同 Network Layer（L10–L14：IP、subnetting/CIDR、forwarding、fragmentation、NAT、ICMP）。格式：2 個 section，每個 section 一張圖（如 TCP timeline、subnet topology）+ 每個 section 5 條 structured 短答題（共 10 條 — 用 incremental PDF builder：pdf_create_draft → pdf_add_section_content → pdf_render_draft，唔好用 one-shot generate_pdf）（numbered、「Answer: ___」/填空/短解 — 千祈唔好將 (a)(b)(c) 塞入同一條 prompt）。題型混合：subnet mask 計算、TCP cwnd 演變、「解釋 forwarding 決定」walkthrough、header field 解讀。總分 ~40。Answer Key 要連步驟。',
    },
    targetMode: 'agent',
    accent: 'violet',
  },
  {
    icon: Route,
    label: { en: 'Paper · Network + Routing', zh: 'Paper · Network + Routing' },
    prompt: {
      en: 'Generate a focused ELEC 3120 practice PDF (Title: "Network Layer + Routing — Structured Questions") covering ONLY Network Layer addressing (L10–L12: IP, CIDR, NAT) and Routing (L13–L14: Distance Vector, Link State, BGP, OSPF, RIP). Format: 2 sections, each with ONE diagram (subnet topology, routing table, or DV iteration table) and exactly 5 structured short-answer sub-questions (10 total — use the incremental PDF builder: pdf_create_draft → pdf_add_section_content → pdf_render_draft, NOT one-shot generate_pdf) (numbered, "Answer: ___" / fill-in / short-explain — NEVER stack (a)(b)(c) inside one prompt). Mix: CIDR aggregation, DV table iterations, "which route does BGP pick and why", count-to-infinity walkthroughs. ~40 points total. Include Answer Key with worked steps.',
      zh: '請整一份 focused ELEC 3120 練習 PDF（標題：「Network Layer + Routing — Structured Questions」），只覆蓋 Network Layer addressing（L10–L12：IP、CIDR、NAT）同 Routing（L13–L14：Distance Vector、Link State、BGP、OSPF、RIP）。格式：2 個 section，每個 section 一張圖（subnet topology、routing table 或 DV iteration table）+ 每個 section 5 條 structured 短答題（共 10 條 — 用 incremental PDF builder：pdf_create_draft → pdf_add_section_content → pdf_render_draft，唔好用 one-shot generate_pdf）（numbered、「Answer: ___」/填空/短解 — 千祈唔好將 (a)(b)(c) 塞入同一條 prompt）。題型混合：CIDR aggregation、DV table iterations、「BGP 揀邊條 route 同點解」、count-to-infinity walkthrough。總分 ~40。Answer Key 要連步驟。',
    },
    targetMode: 'agent',
    accent: 'violet',
  },
  {
    icon: Server,
    label: { en: 'Paper · App + Transport', zh: 'Paper · App + Transport' },
    prompt: {
      en: 'Generate a focused ELEC 3120 practice PDF (Title: "Application Layer + Transport Layer — Structured Questions") covering ONLY Application Layer (L02–L03: HTTP, DNS, SMTP, P2P, CDN, cookies, persistent vs non-persistent connections) and Transport Layer (L05–L09: TCP/UDP, RDT, sockets). Format: 2 sections, each with ONE diagram (HTTP timing diagram, DNS lookup sequence, or TCP handshake) and exactly 5 structured short-answer sub-questions (10 total — use the incremental PDF builder: pdf_create_draft → pdf_add_section_content → pdf_render_draft, NOT one-shot generate_pdf) (numbered, "Answer: ___" / fill-in / short-explain — NEVER stack (a)(b)(c) inside one prompt). Mix: HTTP RTT calculations, DNS resolution walkthroughs, "TCP vs UDP for this app — explain", header reads. ~40 points total. Include Answer Key with worked steps.',
      zh: '請整一份 focused ELEC 3120 練習 PDF（標題：「Application Layer + Transport Layer — Structured Questions」），只覆蓋 Application Layer（L02–L03：HTTP、DNS、SMTP、P2P、CDN、cookies、persistent vs non-persistent）同 Transport Layer（L05–L09：TCP/UDP、RDT、sockets）。格式：2 個 section，每個 section 一張圖（HTTP timing、DNS lookup sequence 或 TCP handshake）+ 每個 section 5 條 structured 短答題（共 10 條 — 用 incremental PDF builder：pdf_create_draft → pdf_add_section_content → pdf_render_draft，唔好用 one-shot generate_pdf）（numbered、「Answer: ___」/填空/短解 — 千祈唔好將 (a)(b)(c) 塞入同一條 prompt）。題型混合：HTTP RTT 計算、DNS resolution walkthrough、「呢個 app 用 TCP 定 UDP — 解釋」、header 解讀。總分 ~40。Answer Key 要連步驟。',
    },
    targetMode: 'agent',
    accent: 'violet',
  },
  {
    icon: Wifi,
    label: { en: 'Paper · Wireless + Link', zh: 'Paper · Wireless + Link' },
    prompt: {
      en: 'Generate a focused ELEC 3120 practice PDF (Title: "Wireless + Link Layer — Structured Questions") covering ONLY Wireless (L16: 802.11, CSMA/CA, hidden terminal, RTS/CTS, mobility) and Link Layer (L13, L15: MAC, ARP, Ethernet, switching, CSMA/CD). Format: 2 sections, each with ONE diagram (WiFi BSS topology, hidden-terminal scenario, or LAN switch table) and exactly 5 structured short-answer sub-questions (10 total — use the incremental PDF builder: pdf_create_draft → pdf_add_section_content → pdf_render_draft, NOT one-shot generate_pdf) (numbered, "Answer: ___" / fill-in / short-explain — NEVER stack (a)(b)(c) inside one prompt). Mix: "explain why CSMA/CA differs from CSMA/CD", hidden-terminal walkthroughs, ARP resolution steps, MAC learning trace. ~40 points total. Include Answer Key with worked steps.',
      zh: '請整一份 focused ELEC 3120 練習 PDF（標題：「Wireless + Link Layer — Structured Questions」），只覆蓋 Wireless（L16：802.11、CSMA/CA、hidden terminal、RTS/CTS、mobility）同 Link Layer（L13, L15：MAC、ARP、Ethernet、switching、CSMA/CD）。格式：2 個 section，每個 section 一張圖（WiFi BSS topology、hidden-terminal scenario 或 LAN switch table）+ 每個 section 5 條 structured 短答題（共 10 條 — 用 incremental PDF builder：pdf_create_draft → pdf_add_section_content → pdf_render_draft，唔好用 one-shot generate_pdf）（numbered、「Answer: ___」/填空/短解 — 千祈唔好將 (a)(b)(c) 塞入同一條 prompt）。題型混合：「點解 CSMA/CA 同 CSMA/CD 唔同」、hidden-terminal walkthrough、ARP resolution 步驟、MAC learning trace。總分 ~40。Answer Key 要連步驟。',
    },
    targetMode: 'agent',
    accent: 'violet',
  },
  {
    icon: GraduationCap,
    label: { en: 'Lecture Quiz', zh: '出測驗題' },
    prompt: {
      en: 'Generate 5 multiple-choice questions strictly based on ELEC3120 lecture content (cite which lecture each question comes from). Include detailed explanations.',
      zh: '請根據 ELEC3120 lecture 內容出 5 條選擇題，範圍隨機抽（L01–L18），每題要標明出自邊份 lecture，並附詳細解釋。',
    },
  },
  {
    icon: Sparkles,
    label: { en: 'Key Points', zh: '重點總結' },
    prompt: {
      en: 'Summarize the key exam points from ELEC3120, organized by layer: Application (L02–L03), Transport (L05–L09), Network (L10–L14), Link (L13, L15), Wireless (L16), Advanced (L17–L18).',
      zh: '請幫我總結 ELEC3120 考試重點，按層次整理：Application（L02–L03）、Transport（L05–L09）、Network（L10–L14）、Link（L13, L15）、Wireless（L16）、Advanced（L17–L18）。',
    },
  },
  {
    icon: Lightbulb,
    label: { en: 'Plain Explain', zh: '白話解釋' },
    prompt: {
      en: 'Pick a core ELEC3120 concept and explain it in plain language using Prof Meng\'s style of real-life analogies (e.g. Jimmy/mooncake for distance vector).',
      zh: '揀一個 ELEC3120 核心概念，用 Prof Meng 嘅生活化 analogy（例如 Jimmy 送 mooncake 解釋 distance vector）白話咁解釋俾我聽。',
    },
  },
  {
    icon: Sigma,
    label: { en: 'Key Formulas', zh: '必記公式' },
    prompt: {
      en: 'List all key formulas I need to memorize for ELEC3120 exam: throughput, RTT, cwnd growth (Tahoe/Reno), goodput, subnet mask/CIDR, queueing (Little\'s Law). For each, show when to apply it.',
      zh: '列出 ELEC3120 考試必記嘅公式：throughput、RTT、cwnd 增長（Tahoe/Reno）、goodput、subnet mask/CIDR、queueing（Little\'s Law）等。每條公式要講應用場景。',
    },
  },
  {
    icon: Target,
    label: { en: 'Exam Focus', zh: '考試熱點' },
    prompt: {
      en: 'Based on ELEC3120 lecture content, which topics are most likely to appear on the final exam? Rank them and explain why.',
      zh: '根據 ELEC3120 lecture 內容，final exam 最有可能考邊啲 topic？幫我排優先次序，並解釋點解。',
    },
  },
  {
    icon: Calculator,
    label: { en: 'Worked Example', zh: '例題演算' },
    prompt: {
      en: 'Give me one worked example with step-by-step calculation from ELEC3120 (e.g. TCP cwnd evolution, BGP route selection, subnetting, or Distance Vector convergence).',
      zh: '俾一題 ELEC3120 例題，逐步示範計算過程（例如 TCP cwnd 演變、BGP 選路、subnet 劃分、Distance Vector 收斂等）。',
    },
  },
];

const MODE_OPTIONS: Array<{ value: ChatMode; icon: typeof BookOpen; label: { en: string; zh: string }; placeholder: { en: string; zh: string } }> = [
  {
    value: 'tutor',
    icon: BookOpen,
    label: { en: 'Tutor', zh: '導師' },
    placeholder: { en: 'Ask about ELEC3120…', zh: '問 ELEC3120 lecture 內容…' },
  },
  {
    value: 'code',
    icon: Code2,
    label: { en: 'Code', zh: '程式' },
    placeholder: { en: 'Paste code or ask programming questions…', zh: '貼 code 或問程式問題…' },
  },
  {
    value: 'image',
    icon: Wand2,
    label: { en: 'Image', zh: '繪圖' },
    placeholder: {
      en: 'Describe an image — I will explain it in detail',
      zh: '描述一張圖 — 我會用文字詳細形容',
    },
  },
  {
    value: 'agent',
    icon: Sparkles,
    label: { en: 'Agent', zh: 'Agent' },
    placeholder: {
      en: 'Ask me to make a worksheet, mock exam PDF, study sheet…',
      zh: '叫我整 worksheet、mock exam PDF、溫書筆記…',
    },
  },
];

export function ChatInput({
  onSend,
  onStop,
  isLoading,
  language,
  mode = 'tutor',
  onModeChange,
  webSearch = false,
  onWebSearchChange,
  agentReasoningLevel = 'high',
  onAgentReasoningLevelChange,
  selectedModel = 'Claude-Opus-4.7',
  onSelectedModelChange,
}: ChatInputProps) {
  const [message, setMessage] = useState('');
  const [attachedImage, setAttachedImage] = useState<string | null>(null);
  const [attachedPdf, setAttachedPdf] = useState<{ name: string; data: string; size: number } | null>(null);
  const [isFocused, setIsFocused] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isRecordingError, setIsRecordingError] = useState(false);
  const { toast } = useToast();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  // Reset height when message is cleared
  useEffect(() => {
    if (!message && textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [message]);

  const handleSend = useCallback(() => {
    const trimmed = message.trim();
    if (!trimmed && !attachedImage && !attachedPdf) return;
    if (isLoading) return;

    onSend(
      trimmed || (attachedPdf
        ? (language === 'en' ? `Uploaded file: ${attachedPdf.name}` : `上傳咗檔案：${attachedPdf.name}`)
        : (language === 'en' ? 'Uploaded a file' : '上傳咗一個檔案')
      ),
      !!attachedImage,
      !!attachedPdf,
      attachedImage,
      attachedPdf?.data || null,
      attachedPdf?.name
    );
    setMessage('');
    setAttachedImage(null);
    setAttachedPdf(null);
  }, [message, attachedImage, attachedPdf, isLoading, onSend, language]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type.startsWith('image/')) {
      if (file.size > MAX_IMAGE_SIZE) {
        toast({
          title: language === 'en' ? 'File too large' : '檔案過大',
          description: language === 'en'
            ? `Image must be under ${MAX_IMAGE_SIZE / 1024 / 1024}MB`
            : `圖片唔可以超過 ${MAX_IMAGE_SIZE / 1024 / 1024}MB`,
          variant: 'destructive',
        });
        if (imageInputRef.current) imageInputRef.current.value = '';
        return;
      }
      const reader = new FileReader();
      reader.onload = () => setAttachedImage(reader.result as string);
      reader.readAsDataURL(file);
    }
    if (imageInputRef.current) imageInputRef.current.value = '';
  };

  const handlePdfUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // If user picks an image via the file picker, route it to the image flow.
      if (file.type.startsWith('image/')) {
        if (file.size > MAX_IMAGE_SIZE) {
          toast({
            title: language === 'en' ? 'File too large' : '檔案過大',
            description: language === 'en'
              ? `Image must be under ${MAX_IMAGE_SIZE / 1024 / 1024}MB`
              : `圖片唔可以超過 ${MAX_IMAGE_SIZE / 1024 / 1024}MB`,
            variant: 'destructive',
          });
        } else {
          const reader = new FileReader();
          reader.onload = () => setAttachedImage(reader.result as string);
          reader.readAsDataURL(file);
        }
        if (pdfInputRef.current) pdfInputRef.current.value = '';
        return;
      }

      if (file.size > MAX_PDF_SIZE) {
        toast({
          title: language === 'en' ? 'File too large' : '檔案過大',
          description: language === 'en'
            ? 'Maximum file size is 10MB.'
            : '最大檔案大小為 10MB。',
          variant: 'destructive',
        });
        if (pdfInputRef.current) pdfInputRef.current.value = '';
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const dataUri = reader.result as string;
        const base64 = dataUri.split(',')[1] || '';
        setAttachedPdf({ name: file.name, data: base64, size: file.size });
      };
      reader.readAsDataURL(file);
    }
    if (pdfInputRef.current) pdfInputRef.current.value = '';
  };

  const processDroppedFile = useCallback((file: File) => {
    if (file.type.startsWith('image/')) {
      if (file.size > MAX_IMAGE_SIZE) {
        toast({
          title: language === 'en' ? 'File too large' : '檔案過大',
          description: language === 'en'
            ? `Image must be under ${MAX_IMAGE_SIZE / 1024 / 1024}MB`
            : `圖片唔可以超過 ${MAX_IMAGE_SIZE / 1024 / 1024}MB`,
          variant: 'destructive',
        });
        return;
      }
      const reader = new FileReader();
      reader.onload = () => setAttachedImage(reader.result as string);
      reader.readAsDataURL(file);
    } else {
      // Any other file type — PDF, DOCX, PPTX, text, code, csv, json…
      if (file.size > MAX_PDF_SIZE) {
        toast({
          title: language === 'en' ? 'File too large' : '檔案過大',
          description: language === 'en'
            ? 'Maximum file size is 10MB.'
            : '最大檔案大小為 10MB。',
          variant: 'destructive',
        });
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const dataUri = reader.result as string;
        const base64 = dataUri.split(',')[1] || '';
        setAttachedPdf({ name: file.name, data: base64, size: file.size });
      };
      reader.readAsDataURL(file);
    }
  }, [language, toast]);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      processDroppedFile(file);
    }
  }, [processDroppedFile]);

  const handleTextareaInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setMessage(value);
    const el = e.target;
    el.style.height = 'auto';
    // Allow the input to grow up to ~45% of the viewport (capped at 360px)
    // so multi-line questions stay fully visible.
    const cap = Math.min(360, Math.floor(window.innerHeight * 0.45));
    el.style.height = Math.min(el.scrollHeight, cap) + 'px';
  };

  const canSend = message.trim() || attachedImage || attachedPdf;
  const speechSupported = typeof window !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;

  // Cleanup media recorder on unmount
  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        try {
          mediaRecorderRef.current.stop();
        } catch {}
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      }
    };
  }, []);

  // Toggle voice recording
  const handleToggleRecording = useCallback(async () => {
    if (isRecording) {
      mediaRecorderRef.current?.stop();
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = getSupportedMimeType();

      if (!mimeType) {
        stream.getTracks().forEach(t => t.stop());
        toast({
          title: language === 'en' ? 'Recording not supported' : '錄音不受支援',
          description: language === 'en'
            ? 'Your browser does not support audio recording. Please try Chrome or Edge.'
            : '您的瀏覽器不支援音頻錄製。請嘗試 Chrome 或 Edge。',
          variant: 'destructive',
        });
        setIsRecordingError(true);
        setTimeout(() => setIsRecordingError(false), 3000);
        return;
      }

      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      chunksRef.current = [];
      streamRef.current = stream;

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        streamRef.current = null;
        setIsRecording(false);

        if (chunksRef.current.length === 0) return;

        const blob = new Blob(chunksRef.current, { type: mimeType });
        const reader = new FileReader();
        reader.onload = async () => {
          const base64 = (reader.result as string).split(',')[1];
          try {
            const res = await fetch('/api/transcribe', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ audioData: base64, language }),
            });
            const data = await res.json();
            if (data.text) {
              setMessage(prev => (prev ? prev + ' ' : '') + data.text.trim());
            }
          } catch {
            toast({
              title: language === 'en' ? 'Transcription failed' : '轉錄失敗',
              description: language === 'en'
                ? 'Could not process audio'
                : '無法處理音頻',
              variant: 'destructive',
            });
          }
        };
        reader.readAsDataURL(blob);
      };

      mediaRecorder.onerror = () => {
        setIsRecording(false);
        setIsRecordingError(true);
        setTimeout(() => setIsRecordingError(false), 3000);
        stream.getTracks().forEach(t => t.stop());
        streamRef.current = null;
        toast({
          title: language === 'en' ? 'Recording error' : '錄音錯誤',
          variant: 'destructive',
        });
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start();
      setIsRecording(true);
      setIsRecordingError(false);
    } catch {
      toast({
        title: language === 'en' ? 'Microphone access denied' : '麥克風存取被拒絕',
        description: language === 'en'
          ? 'Please allow microphone access in your browser settings'
          : '請在瀏覽器設定中允許麥克風存取',
        variant: 'destructive',
      });
    }
  }, [isRecording, language, toast]);

  return (
    <div
      className="relative shrink-0 px-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] lg:pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drag & drop overlay — clean, minimal */}
      {isDragOver && (
        <div className="absolute inset-0 bg-gray-100/90 dark:bg-gray-900/90 backdrop-blur-sm z-10 flex flex-col items-center justify-center gap-2 touch-none rounded-none">
          <Upload className="h-7 w-7 text-gray-500 dark:text-gray-400" />
          <p className="text-sm font-medium text-gray-600 dark:text-gray-300">
            {language === 'en' ? 'Drop files here' : '將檔案拖放至呢個'}
          </p>
        </div>
      )}

      {/* Input container — centered, Poe-style */}
      <div className="max-w-[768px] mx-auto">
        {/* Mode selector + web-search toggle — segmented control row */}
        <div className="flex items-center justify-center gap-2 mb-2 flex-wrap">
          <div className="inline-flex items-center gap-0.5 p-0.5 rounded-full bg-gray-100 dark:bg-white/5 border border-black/5 dark:border-white/10">
            {MODE_OPTIONS.map((opt) => {
              const Icon = opt.icon;
              const active = mode === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => onModeChange?.(opt.value)}
                  disabled={isLoading}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[12px] font-medium transition-all duration-150 touch-manipulation ${
                    active
                      ? 'bg-white dark:bg-[#2a2a2a] text-emerald-700 dark:text-emerald-300 shadow-sm'
                      : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                  aria-pressed={active}
                  title={language === 'en' ? opt.label.en : opt.label.zh}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span>{language === 'en' ? opt.label.en : opt.label.zh}</span>
                </button>
              );
            })}
          </div>

          {/* Web search toggle — disabled in image mode (irrelevant) */}
          {mode !== 'image' && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => onWebSearchChange?.(!webSearch)}
                  disabled={isLoading}
                  aria-pressed={webSearch}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[12px] font-medium border transition-all duration-150 touch-manipulation ${
                    webSearch
                      ? 'bg-sky-50 dark:bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-300/70 dark:border-sky-500/40 shadow-[0_0_0_3px_rgba(56,189,248,0.10)]'
                      : 'bg-gray-100 dark:bg-white/5 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 border-black/5 dark:border-white/10'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  <Globe className={`h-3.5 w-3.5 ${webSearch ? 'text-sky-600 dark:text-sky-400' : ''}`} />
                  <span>{language === 'en' ? 'Web Search' : '網絡搜尋'}</span>
                  {webSearch && (
                    <span className="ml-0.5 inline-flex items-center justify-center h-3.5 px-1 rounded-full bg-sky-200/80 dark:bg-sky-500/30 text-[9px] font-bold uppercase tracking-wider text-sky-800 dark:text-sky-200">
                      On
                    </span>
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" sideOffset={6} className="text-xs max-w-[260px]">
                {language === 'en'
                  ? 'Search the web for fresh info. Adds source links to the reply.'
                  : '搜尋網絡攞最新資訊，回覆會附上來源連結。'}
              </TooltipContent>
            </Tooltip>
          )}

          {/* Reasoning effort dropdown — only visible in Agent Mode.
              Maps to OpenRouter's `reasoning.effort` (Gemini /
              thinkingBudget). Defaults to "high". */}
          {mode === 'agent' && (
            <Tooltip>
              <DropdownMenu>
                <TooltipTrigger asChild>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      disabled={isLoading}
                      aria-label={language === 'en' ? 'Thinking level' : '思考程度'}
                      className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[12px] font-medium border transition-all duration-150 touch-manipulation bg-violet-50 dark:bg-violet-500/15 text-violet-700 dark:text-violet-300 border-violet-300/70 dark:border-violet-500/40 hover:bg-violet-100 dark:hover:bg-violet-500/25 disabled:opacity-50 disabled:cursor-not-allowed`}
                    >
                      <Brain className="h-3.5 w-3.5" />
                      <span>
                        {language === 'en' ? 'Thinking' : '思考'}
                      </span>
                      <span className="ml-0.5 inline-flex items-center justify-center h-3.5 px-1 rounded-full bg-violet-200/80 dark:bg-violet-500/30 text-[9px] font-bold uppercase tracking-wider text-violet-800 dark:text-violet-200">
                        {agentReasoningLevel}
                      </span>
                      <ChevronDown className="h-3 w-3 opacity-70" />
                    </button>
                  </DropdownMenuTrigger>
                </TooltipTrigger>
                <DropdownMenuContent align="center" sideOffset={6} className="min-w-[220px]">
                  {(['low', 'medium', 'high'] as const).map((lvl) => {
                    const labels = {
                      low: { en: 'Low — fastest, less analysis', zh: 'Low — 最快，分析較淺' },
                      medium: { en: 'Medium — balanced', zh: 'Medium — 平衡' },
                      high: { en: 'High — deepest reasoning (default)', zh: 'High — 最深入推理（預設）' },
                    };
                    const active = agentReasoningLevel === lvl;
                    return (
                      <DropdownMenuItem
                        key={lvl}
                        onSelect={() => onAgentReasoningLevelChange?.(lvl)}
                        className={`flex items-center justify-between gap-3 cursor-pointer ${
                          active ? 'bg-violet-50 dark:bg-violet-500/15 text-violet-700 dark:text-violet-300' : ''
                        }`}
                      >
                        <span className="text-xs">
                          {language === 'en' ? labels[lvl].en : labels[lvl].zh}
                        </span>
                        {active && (
                          <span className="text-[10px] font-bold uppercase tracking-wider text-violet-600 dark:text-violet-300">
                            ✓
                          </span>
                        )}
                      </DropdownMenuItem>
                    );
                  })}
                </DropdownMenuContent>
              </DropdownMenu>
              <TooltipContent side="top" sideOffset={6} className="text-xs max-w-[260px]">
                {language === 'en'
                  ? 'Controls the agent model\'s thinking budget. Higher = better reasoning, slower replies. Only applies on the OpenRouter route — Poe bots use their own default.'
                  : '控制 agent 嘅思考時間。越高思考越深入但越慢。淨係 OpenRouter route 有效；用緊 Poe 嘅話 bot 自己 default。'}
              </TooltipContent>
            </Tooltip>
          )}

          {/* Live model picker — Tutor & Code modes only. Image mode uses
              a fixed vision model; Agent mode is locked to its own model
              (OpenRouter deepseek-v4-flash / Poe Gemini-3.1-Pro). */}
          {(mode === 'tutor' || mode === 'code') && (
            <Tooltip>
              <DropdownMenu>
                <TooltipTrigger asChild>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      disabled={isLoading}
                      aria-label={language === 'en' ? 'Model' : '模型'}
                      className="flex items-center gap-1.5 px-3 py-1 rounded-full text-[12px] font-medium border transition-all duration-150 touch-manipulation bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-300/70 dark:border-amber-500/40 hover:bg-amber-100 dark:hover:bg-amber-500/25 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Cpu className="h-3.5 w-3.5" />
                      <span className="max-w-[100px] truncate">
                        {MODEL_OPTIONS.find((m) => m.id === selectedModel)?.label || selectedModel}
                      </span>
                      <ChevronDown className="h-3 w-3 opacity-70" />
                    </button>
                  </DropdownMenuTrigger>
                </TooltipTrigger>
                <DropdownMenuContent align="center" sideOffset={6} className="min-w-[300px]">
                  {MODEL_OPTIONS.map((opt) => {
                    const active = selectedModel === opt.id;
                    return (
                      <DropdownMenuItem
                        key={opt.id}
                        onSelect={() => onSelectedModelChange?.(opt.id)}
                        className={`flex flex-col items-start gap-0.5 cursor-pointer py-2 ${
                          active ? 'bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300' : ''
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 w-full">
                          <span className="text-xs font-semibold">{opt.label}</span>
                          <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-200/70 dark:bg-amber-500/25 text-amber-800 dark:text-amber-200">
                            {opt.badge}
                          </span>
                        </div>
                        <span className="text-[10px] text-gray-500 dark:text-gray-400 leading-snug">
                          {language === 'en' ? opt.hint.en : opt.hint.zh}
                        </span>
                      </DropdownMenuItem>
                    );
                  })}
                </DropdownMenuContent>
              </DropdownMenu>
              <TooltipContent side="top" sideOffset={6} className="text-xs max-w-[260px]">
                {language === 'en'
                  ? 'Switch the AI model used for Tutor & Code replies. Stored in your browser.'
                  : '切換 Tutor / Code 模式用嘅 AI 模型。會記喺你部機度。'}
              </TooltipContent>
            </Tooltip>
          )}
        </div>

        {/* Quick Actions Bar — visible in Tutor and Agent modes, when input is focused or empty */}
        <div className={`flex items-center gap-2 mb-2 overflow-x-auto no-scrollbar transition-all duration-300 ${
          (mode === 'tutor' || mode === 'agent') && (isFocused || !message) && !isLoading
            ? 'opacity-100 translate-y-0 max-h-10'
            : 'opacity-0 translate-y-1 max-h-0 overflow-hidden pointer-events-none'
        }`}>
          {quickActions.map((action) => {
            const ActionIcon = action.icon;
            const isViolet = action.accent === 'violet';
            const baseStyle = isViolet
              ? 'border-violet-300/70 dark:border-violet-700/50 bg-violet-50 dark:bg-violet-950/30 text-violet-700 dark:text-violet-300 hover:bg-violet-100 dark:hover:bg-violet-900/40 hover:border-violet-400/80 dark:hover:border-violet-600/60 hover:shadow-[0_0_10px_rgba(139,92,246,0.18)]'
              : 'border-emerald-200/60 dark:border-emerald-800/40 bg-emerald-50/80 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 hover:border-emerald-300/70 dark:hover:border-emerald-700/50 hover:shadow-[0_0_8px_rgba(16,185,129,0.1)]';
            return (
              <button
                key={action.label.en}
                onClick={() => {
                  const prompt = language === 'en' ? action.prompt.en : action.prompt.zh;
                  if (action.targetMode && action.targetMode !== mode) {
                    onModeChange?.(action.targetMode);
                  }
                  setMessage(prompt);
                  textareaRef.current?.focus();
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium whitespace-nowrap transition-all duration-200 active:scale-[0.97] shrink-0 touch-manipulation ${baseStyle}`}
                title={language === 'en' ? action.prompt.en : action.prompt.zh}
              >
                <ActionIcon className="h-3.5 w-3.5" />
                <span>{language === 'en' ? action.label.en : action.label.zh}</span>
              </button>
            );
          })}
        </div>

        {/* Attachments preview */}
        {(attachedImage || attachedPdf) && (
          <div className="flex gap-2 mb-2 flex-wrap">
            {attachedImage && (
              <div className="relative group rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 p-1.5 flex items-center gap-2">
                <div className="h-8 w-8 rounded overflow-hidden shrink-0">
                  <img src={attachedImage} alt="Preview" className="h-full w-full object-cover" />
                </div>
                <span className="text-xs text-gray-600 dark:text-gray-300">
                  {language === 'en' ? 'Image' : '圖片'}
                </span>
                <button
                  onClick={() => setAttachedImage(null)}
                  className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-gray-400 dark:bg-gray-500 text-white flex items-center justify-center hover:bg-red-500 transition-colors shadow-sm touch-manipulation"
                  aria-label="Remove image"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            )}
            {attachedPdf && (
              <div className="relative group rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 p-2 flex items-center gap-2">
                <FileText className="h-4 w-4 text-gray-600 dark:text-gray-300 shrink-0" />
                <div className="flex flex-col min-w-0">
                  <span className="text-xs text-gray-600 dark:text-gray-300 max-w-[120px] truncate">
                    {attachedPdf.name}
                  </span>
                  <span className="text-[10px] text-gray-400 dark:text-gray-500">
                    {formatFileSize(attachedPdf.size)}
                  </span>
                </div>
                <button
                  onClick={() => setAttachedPdf(null)}
                  className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-gray-400 dark:bg-gray-500 text-white flex items-center justify-center hover:bg-red-500 transition-colors touch-manipulation"
                  aria-label="Remove PDF"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </div>
            )}
          </div>
        )}

        {/* Poe-style input container — rounded rectangle, minimal border */}
        <div
          className={`relative flex items-end rounded-2xl border transition-all duration-250 input-emerald-underline ${isFocused ? 'input-focused' : ''} ${
            isFocused
              ? 'border-emerald-300/60 dark:border-emerald-600/40 bg-white dark:bg-[#2a2a2a] input-focused-glow'
              : 'border-black/10 dark:border-white/10 bg-white dark:bg-[#2a2a2a]'
          } ${isDragOver ? 'border-gray-400 dark:border-gray-500' : ''}`}
        >
          {/* Left side buttons — image, PDF, mic */}
          <div className="flex items-center gap-0.5 pl-2.5 pb-2.5 pt-2.5 shrink-0">
            <input
              type="file"
              accept="image/*"
              ref={imageInputRef}
              onChange={handleImageUpload}
              className="hidden"
              aria-hidden="true"
            />
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  className="h-7 w-7 flex items-center justify-center rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors duration-150 touch-manipulation"
                  onClick={() => imageInputRef.current?.click()}
                  aria-label={language === 'en' ? 'Upload image' : '上傳圖片'}
                >
                  <ImageIcon className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" sideOffset={6} className="text-xs">
                {language === 'en' ? 'Upload Image' : '上傳圖片'}
              </TooltipContent>
            </Tooltip>

            <input
              type="file"
              accept=".pdf,.docx,.pptx,.txt,.md,.markdown,.rst,.log,.csv,.tsv,.json,.jsonl,.xml,.yaml,.yml,.toml,.ini,.conf,.env,.html,.htm,.css,.scss,.less,.js,.jsx,.ts,.tsx,.mjs,.cjs,.py,.rb,.php,.go,.rs,.java,.kt,.scala,.swift,.c,.cc,.cpp,.cxx,.h,.hpp,.cs,.fs,.sh,.bash,.zsh,.ps1,.bat,.cmd,.sql,.graphql,.proto,.r,.jl,.lua,.pl,.tex,.bib,.srt,.vtt"
              ref={pdfInputRef}
              onChange={handlePdfUpload}
              className="hidden"
              aria-hidden="true"
            />
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  className="h-7 w-7 flex items-center justify-center rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors duration-150 touch-manipulation"
                  onClick={() => pdfInputRef.current?.click()}
                  aria-label={language === 'en' ? 'Upload file' : '上傳檔案'}
                >
                  <Paperclip className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" sideOffset={6} className="text-xs">
                {language === 'en'
                  ? 'Upload file (PDF, Word, PowerPoint, text, code…)'
                  : '上傳檔案（PDF、Word、PowerPoint、文字、程式碼⋯⋯）'}
              </TooltipContent>
            </Tooltip>

            {/* Microphone — left side, third button */}
            {speechSupported && !isLoading && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="relative">
                    {isRecording && (
                      <span className="absolute inset-0 rounded-md bg-red-400/20 dark:bg-red-500/20 animate-mic-pulse" />
                    )}
                    <button
                      onClick={handleToggleRecording}
                      className={`relative h-7 w-7 flex items-center justify-center rounded-md transition-colors duration-150 touch-manipulation ${
                        isRecording
                          ? 'text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30'
                          : isRecordingError
                            ? 'text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30'
                            : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/10'
                      }`}
                      aria-label={isRecording
                        ? (language === 'en' ? 'Stop recording' : '停止錄音')
                        : (language === 'en' ? 'Voice input' : '語音輸入')}
                    >
                      {isRecordingError ? (
                        <MicOff className="h-3.5 w-3.5" />
                      ) : (
                        <Mic className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs">
                  {isRecording
                    ? (language === 'en' ? 'Stop recording' : '停止錄音')
                    : (language === 'en' ? 'Voice input' : '語音輸入')}
                </TooltipContent>
              </Tooltip>
            )}
          </div>

          {/* Textarea */}
          <textarea
            ref={textareaRef}
            value={message}
            onChange={handleTextareaInput}
            onKeyDown={handleKeyDown}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            placeholder={(() => {
              const opt = MODE_OPTIONS.find((o) => o.value === mode) || MODE_OPTIONS[0];
              return language === 'en' ? opt.placeholder.en : opt.placeholder.zh;
            })()}
            className="flex-1 resize-none bg-transparent border-0 focus:outline-none text-gray-800 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 text-[15px] leading-relaxed py-2.5 pl-1 pr-1 max-h-[45dvh] sm:max-h-[360px] min-h-[24px] touch-manipulation textarea-smooth-resize"
            rows={1}
            disabled={isLoading}
          />

          {/* Right side — send button only */}
          <div className="flex items-center pr-2.5 pb-2.5 pt-2.5 shrink-0">
            {/* "Listening..." label when recording */}
            {isRecording && (
              <span className="text-[11px] text-red-500 dark:text-red-400 font-medium whitespace-nowrap mr-1.5">
                {language === 'en' ? 'Listening...' : '聆聽中…'}
              </span>
            )}
            {isLoading && onStop ? (
              <button
                onClick={onStop}
                className="h-8 w-8 flex items-center justify-center rounded-lg transition-all duration-200 touch-manipulation btn-press bg-[#1b1b1b] text-white dark:bg-white dark:text-black hover:bg-[#333] dark:hover:bg-gray-200 hover:scale-105"
                aria-label={language === 'en' ? 'Stop generating' : '停止生成'}
                title={language === 'en' ? 'Stop' : '停止'}
              >
                <Square className="h-3 w-3 fill-current" />
              </button>
            ) : (
              <button
                onClick={handleSend}
                disabled={isLoading || !canSend}
                className={`h-8 w-8 flex items-center justify-center rounded-lg transition-all duration-200 touch-manipulation btn-press ${
                  canSend && !isLoading
                    ? 'bg-[#1b1b1b] text-white dark:bg-white dark:text-black hover:bg-[#333] dark:hover:bg-gray-200 hover:scale-105'
                    : 'bg-[#e0e0e0] text-[#999] dark:bg-[#444] dark:text-[#666] cursor-not-allowed'
                }`}
                aria-label={language === 'en' ? 'Send message' : '發送訊息'}
              >
                {isLoading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Send className="h-3.5 w-3.5" />
                )}
              </button>
            )}
          </div>
        </div>

        {/* Disclaimer — Poe-style subtle text */}
        <p className="text-[11px] text-gray-400 dark:text-gray-500 text-center mt-1.5 px-1 tracking-wide">
          {language === 'en'
            ? 'AI may produce inaccurate information.'
            : 'AI 生成內容可能有誤，請核對 lecture notes。'}
        </p>
      </div>
    </div>
  );
}
