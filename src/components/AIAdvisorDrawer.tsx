import React, { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { X, Sparkles, Send, Bot, User, Loader2, Lightbulb, ShieldCheck } from 'lucide-react';
import { Jar, Transaction } from '../types';

interface AIAdvisorDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  jars: Jar[];
  monthlyIncome: number;
  transactions: Transaction[];
  isAmountsHidden?: boolean;
}

interface ChatMessage {
  id: string;
  sender: 'user' | 'ai';
  text: string;
}

export const AIAdvisorDrawer: React.FC<AIAdvisorDrawerProps> = ({
  isOpen,
  onClose,
  jars,
  monthlyIncome,
  transactions,
  isAmountsHidden = false,
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      sender: 'ai',
      text: 'Xin chào! Tôi là Trợ lý Tài chính AI của RoFinance. Hãy hỏi tôi một câu cụ thể về ngân sách, tiết kiệm, nợ, dòng tiền hoặc kế hoạch tài chính cá nhân.',
    },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    closeButtonRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSendMessage = async (queryText?: string) => {
    const textToSend = queryText || input;
    if (!textToSend.trim() || isLoading) return;

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      sender: 'user',
      text: textToSend,
    };

    setMessages((prev) => [...prev, userMsg]);
    if (!queryText) setInput('');
    setIsLoading(true);

    try {
      const res = await fetch('/api/financial-advice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userQuery: textToSend,
          jars,
          monthlyIncome,
          recentTransactions: transactions.slice(0, 10),
        }),
      });

      const data = await res.json();

      if (data.success && data.reply) {
        setMessages((prev) => [
          ...prev,
          {
            id: (Date.now() + 1).toString(),
            sender: 'ai',
            text: data.reply,
          },
        ]);
      } else {
        throw new Error(data.error || 'Có lỗi xảy ra khi hỏi Gemini');
      }
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          sender: 'ai',
          text: `⚠️ Trợ lý AI đang gặp sự cố kết nối: ${err.message}. Vui lòng thử lại sau.`,
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <aside
      id="ai-advisor-popup"
      role="dialog"
      aria-modal="false"
      aria-labelledby="ai-advisor-title"
      className="fixed bottom-4 right-4 z-40 h-[min(70dvh,42rem)] max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-[24rem] sm:bottom-6 sm:right-6"
    >
      <div className="flex h-full w-full flex-col overflow-hidden rounded-2xl border border-zinc-700 bg-[#18181b] text-zinc-100 shadow-2xl shadow-black/50">
        {/* Header */}
        <div className="bg-[#121214] text-white p-3.5 flex items-center justify-between border-b border-zinc-800">
          <div className="flex min-w-0 items-center space-x-2.5">
            <div className="p-2 bg-indigo-500/10 rounded-xl border border-indigo-500/20 text-indigo-400">
              <Sparkles className="w-4 h-4 text-indigo-400" />
            </div>
            <div className="min-w-0">
              <h2 id="ai-advisor-title" className="truncate text-sm font-black text-white tracking-tight">Trợ Lý Tài Chính AI Gemini</h2>
              <p className="text-[11px] text-zinc-400">Tư vấn phân bổ hũ tài chính thông minh</p>
            </div>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Đóng trợ lý AI"
            className="cursor-pointer rounded-xl p-1.5 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/60"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Quick Question Prompts */}
        <div className="bg-[#121214] p-3 border-b border-zinc-800 space-y-2">
          <div className="text-[10px] uppercase font-bold text-indigo-400 tracking-wider flex items-center space-x-1">
            <Lightbulb className="w-3 h-3 text-indigo-400" />
            <span>Gợi ý câu hỏi nhanh:</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {[
              'Phân tích tổng quan hũ tài chính của tôi',
              'Làm sao để cắt giảm chi tiêu hũ Trả Nợ DEBT?',
              'Tư vấn đầu tư cho hũ Tự do tài chính FFA',
            ].map((promptText, idx) => (
              <button
                key={idx}
                onClick={() => handleSendMessage(promptText)}
                disabled={isLoading}
                className="cursor-pointer px-2 py-1.5 bg-[#1c1c20] hover:bg-zinc-800 text-zinc-300 border border-zinc-800 text-[10px] font-semibold rounded-lg transition-colors text-left disabled:opacity-50"
              >
                {promptText}
              </button>
            ))}
          </div>
        </div>

        {/* Chat Messages Log */}
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-[#121214] p-3">
          {messages.map((msg) => {
            const isUser = msg.sender === 'user';
            return (
              <div
                key={msg.id}
                className={`flex items-start space-x-2.5 ${isUser ? 'justify-end' : 'justify-start'}`}
              >
                {!isUser && (
                  <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0 text-xs shadow-md mt-1">
                    <Bot className="w-4 h-4" />
                  </div>
                )}
                <div
                  className={`p-3 rounded-2xl text-xs leading-relaxed max-w-[88%] shadow-md overflow-hidden ${
                    isUser
                      ? 'bg-indigo-600 text-white font-medium rounded-br-none'
                      : 'bg-[#1c1c20] text-zinc-100 border border-zinc-800 font-normal rounded-bl-none'
                  }`}
                >
                  {isAmountsHidden ? (
                    <span aria-label="Nội dung được ẩn để bảo vệ số tiền">••••••••</span>
                  ) : isUser ? (
                    <span className="whitespace-pre-wrap">{msg.text}</span>
                  ) : (
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        h1: ({ children }) => <h1 className="text-base font-black text-white mt-3 mb-2 first:mt-0">{children}</h1>,
                        h2: ({ children }) => <h2 className="text-sm font-black text-white mt-3 mb-1.5 first:mt-0">{children}</h2>,
                        h3: ({ children }) => <h3 className="text-xs font-bold text-white mt-2.5 mb-1 first:mt-0">{children}</h3>,
                        p: ({ children }) => <p className="my-2 first:mt-0 last:mb-0">{children}</p>,
                        strong: ({ children }) => <strong className="font-black text-white">{children}</strong>,
                        em: ({ children }) => <em className="italic text-zinc-200">{children}</em>,
                        ul: ({ children }) => <ul className="my-2 pl-4 list-disc space-y-1">{children}</ul>,
                        ol: ({ children }) => <ol className="my-2 pl-4 list-decimal space-y-1">{children}</ol>,
                        li: ({ children }) => <li className="pl-0.5">{children}</li>,
                        blockquote: ({ children }) => (
                          <blockquote className="my-2 border-l-2 border-indigo-500 pl-3 text-zinc-300">
                            {children}
                          </blockquote>
                        ),
                        a: ({ href, children }) => (
                          <a
                            href={href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sky-400 underline underline-offset-2 hover:text-sky-300"
                          >
                            {children}
                          </a>
                        ),
                        code: ({ className, children }) => {
                          const isBlock = Boolean(className) || String(children).includes('\n');
                          return isBlock ? (
                            <code className={`${className || ''} block p-3 text-[11px] leading-relaxed overflow-x-auto bg-black/40 text-emerald-300`}>
                              {children}
                            </code>
                          ) : (
                            <code className="px-1 py-0.5 rounded bg-black/40 text-amber-300 text-[11px]">
                              {children}
                            </code>
                          );
                        },
                        pre: ({ children }) => (
                          <pre className="my-2 overflow-x-auto rounded-xl border border-zinc-700 bg-black/30">
                            {children}
                          </pre>
                        ),
                        table: ({ children }) => (
                          <div className="my-3 overflow-x-auto rounded-xl border border-zinc-700">
                            <table className="w-full min-w-[360px] border-collapse text-[11px]">{children}</table>
                          </div>
                        ),
                        thead: ({ children }) => <thead className="bg-zinc-800 text-white">{children}</thead>,
                        th: ({ children }) => <th className="p-2 text-left font-bold border-b border-zinc-700">{children}</th>,
                        td: ({ children }) => <td className="p-2 align-top border-b border-zinc-800 last:border-b-0">{children}</td>,
                        hr: () => <hr className="my-3 border-zinc-700" />,
                      }}
                    >
                      {msg.text}
                    </ReactMarkdown>
                  )}
                </div>
                {isUser && (
                  <div className="w-8 h-8 rounded-xl bg-zinc-800 text-white flex items-center justify-center shrink-0 text-xs shadow-md mt-1 border border-zinc-700">
                    <User className="w-4 h-4" />
                  </div>
                )}
              </div>
            );
          })}

          {isLoading && (
            <div className="flex items-center space-x-2 text-xs text-indigo-400 bg-[#1c1c20] p-3 rounded-2xl w-fit border border-zinc-800">
              <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
              <span>Gemini AI đang phân tích dữ liệu hũ tài chính...</span>
            </div>
          )}
        </div>

        {/* Input Bar */}
        <div className="p-3 bg-[#121214] border-t border-zinc-800">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="flex items-center space-x-2"
          >
            <input
              type={isAmountsHidden ? 'password' : 'text'}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Hỏi AI về cách quản lý dòng tiền, hũ tài chính..."
              className="min-w-0 flex-1 p-2.5 text-base sm:text-xs bg-[#1c1c20] border border-zinc-700 rounded-xl focus:outline-none focus:border-indigo-500 text-white placeholder-zinc-500 font-medium"
            />
            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              className="cursor-pointer p-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold transition-colors disabled:opacity-50 shrink-0 shadow-lg shadow-indigo-600/20"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      </div>
    </aside>
  );
};
