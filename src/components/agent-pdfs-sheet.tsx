'use client';

import React, { useEffect, useState, useCallback } from 'react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { FileText, Download, RefreshCw, ExternalLink, FileX } from 'lucide-react';

interface AgentPdfItem {
  filename: string;
  url: string;
  title: string;
  sizeKb: number;
  mtime: number;
}

interface AgentPdfsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  language: 'en' | 'zh';
}

function formatRelativeTime(mtime: number, language: 'en' | 'zh'): string {
  const diffMs = Date.now() - mtime;
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 1) return language === 'en' ? 'just now' : '啱啱';
  if (minutes < 60) {
    return language === 'en' ? `${minutes}m ago` : `${minutes} 分鐘前`;
  }
  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    return language === 'en' ? `${hours}h ago` : `${hours} 小時前`;
  }
  const days = Math.round(hours / 24);
  if (days < 30) {
    return language === 'en' ? `${days}d ago` : `${days} 日前`;
  }
  const date = new Date(mtime);
  return date.toLocaleDateString(language === 'en' ? 'en-US' : 'zh-HK', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function AgentPdfsSheet({
  open,
  onOpenChange,
  language,
}: AgentPdfsSheetProps) {
  const [items, setItems] = useState<AgentPdfItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/agent/pdfs', { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { items: AgentPdfItem[] };
      setItems(data.items || []);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) fetchList();
  }, [open, fetchList]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-md p-0 bg-[#1a1a1a] border-l border-[#2a2a2a] text-[#e0e0e0]"
      >
        <SheetHeader className="px-5 pt-5 pb-3 border-b border-[#2a2a2a]">
          <SheetTitle className="text-[#e0e0e0] flex items-center gap-2">
            <FileText className="h-4 w-4 text-emerald-400" />
            {language === 'en' ? 'Generated PDFs' : '已生成嘅 PDF'}
          </SheetTitle>
          <SheetDescription className="text-[#888]">
            {language === 'en'
              ? 'PDFs created by Agent Mode. Newest files appear first; up to 50 files are kept and anything older than 30 days is auto-deleted.'
              : 'Agent 模式整出嘅 PDF。最新嘅排前面；最多保留 50 個檔案，超過 30 日嘅會自動刪除。'}
          </SheetDescription>
        </SheetHeader>

        <div className="flex items-center justify-between px-5 py-2 border-b border-[#2a2a2a]">
          <span className="text-[12px] text-[#888]">
            {loading
              ? language === 'en'
                ? 'Loading…'
                : '載入中…'
              : language === 'en'
                ? `${items.length} ${items.length === 1 ? 'file' : 'files'}`
                : `${items.length} 個檔案`}
          </span>
          <Button
            size="sm"
            variant="ghost"
            onClick={fetchList}
            disabled={loading}
            className="h-7 px-2 text-[#888] hover:text-[#e0e0e0] hover:bg-[#2a2a2a]"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span className="ml-1.5 text-[12px]">
              {language === 'en' ? 'Refresh' : '重新整理'}
            </span>
          </Button>
        </div>

        <ScrollArea className="h-[calc(100vh-180px)]">
          <div className="p-3 space-y-2">
            {error && (
              <div className="px-3 py-2 rounded-md bg-red-950/30 border border-red-900/50 text-red-300 text-[12px]">
                {language === 'en' ? 'Failed to load: ' : '載入失敗：'}
                {error}
              </div>
            )}

            {!loading && !error && items.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 text-[#666]">
                <FileX className="h-10 w-10 mb-2 opacity-50" />
                <p className="text-[13px] text-center">
                  {language === 'en'
                    ? 'No PDFs yet.'
                    : '仲未有任何 PDF。'}
                </p>
                <p className="text-[11px] text-center mt-1 opacity-75">
                  {language === 'en'
                    ? 'Switch to Agent mode and ask for a study guide, mock exam, or summary.'
                    : '切去 Agent 模式，叫佢整溫習 guide、mock 卷、或者摘要。'}
                </p>
              </div>
            )}

            {items.map((item) => (
              <div
                key={item.filename}
                className="group rounded-lg border border-[#2a2a2a] bg-[#181818] hover:border-emerald-700/50 hover:bg-[#1c1c1c] transition-colors p-3"
              >
                <div className="flex items-start gap-3">
                  <div className="shrink-0 mt-0.5">
                    <div className="h-9 w-9 rounded-md bg-emerald-950/40 border border-emerald-900/60 flex items-center justify-center">
                      <FileText className="h-4 w-4 text-emerald-400" />
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-medium text-[#e0e0e0] truncate">
                      {item.title}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 text-[11px] text-[#888]">
                      <span>{formatRelativeTime(item.mtime, language)}</span>
                      <span className="opacity-50">·</span>
                      <span>{item.sizeKb} KB</span>
                    </div>
                  </div>
                </div>
                <div className="mt-2.5 flex gap-1.5">
                  <Button
                    size="sm"
                    variant="outline"
                    asChild
                    className="h-7 px-2 text-[12px] flex-1 bg-transparent border-[#2a2a2a] hover:bg-[#2a2a2a] hover:text-emerald-300"
                  >
                    <a href={item.url} download={item.filename}>
                      <Download className="h-3 w-3 mr-1" />
                      {language === 'en' ? 'Download' : '下載'}
                    </a>
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    asChild
                    className="h-7 px-2 text-[12px] bg-transparent border-[#2a2a2a] hover:bg-[#2a2a2a] hover:text-emerald-300"
                  >
                    <a href={item.url} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="h-3 w-3 mr-1" />
                      {language === 'en' ? 'Open' : '開啟'}
                    </a>
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
