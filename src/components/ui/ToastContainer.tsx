"use client";

import React from 'react';
import { useGameStore } from '@/store/useGameStore';

export default function ToastContainer() {
  const toasts = useGameStore((state) => state.toasts);
  const removeToast = useGameStore((state) => state.removeToast);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[9999] flex flex-col gap-4 w-[calc(100%-32px)] max-w-md pointer-events-none">
      {toasts.map((toast, index) => {
        let bgColor = 'bg-white';
        let accentColor = 'bg-[#fbbf24]'; // 預設黃色
        let icon = '💡';

        if (toast.type === 'success') {
          bgColor = 'bg-[#f0fdf4]'; // 柔和的淡綠底
          accentColor = 'bg-[#86efac]'; // 亮綠色徽章
          icon = '🏆';
        } else if (toast.type === 'error') {
          bgColor = 'bg-[#fef2f2]'; // 淡紅底
          accentColor = 'bg-[#fca5a5]'; // 亮紅徽章
          icon = '💥';
        } else if (toast.type === 'warning') {
          bgColor = 'bg-[#fffbeb]'; // 淡黃底
          accentColor = 'bg-[#fde047]'; // 亮黃徽章
          icon = '⚠️';
        } else if (toast.type === 'info') {
          bgColor = 'bg-[#eff6ff]'; // 淡藍底
          accentColor = 'bg-[#93c5fd]'; // 亮藍徽章
          icon = '✨';
        }

        // 奇偶數賦予微小的左右旋轉，突顯黑白漫畫風手繪感
        const rotationClass = index % 2 === 0 ? 'rotate-[0.8deg]' : '-rotate-[0.8deg]';

        return (
          <div
            key={toast.id}
            className={`pointer-events-auto flex flex-col gap-3 p-5 border-[3px] border-black rounded-2xl shadow-[6px_6px_0px_#000] ${bgColor} text-black transition-all duration-300 transform hover:-translate-y-1 hover:-translate-x-1 hover:shadow-[8px_8px_0px_#000] active:scale-95 ${rotationClass} animate-in fade-in zoom-in-95 duration-200`}
            style={{ fontFamily: 'var(--font-bricolage), system-ui, sans-serif' }}
          >
            {/* 頂部區域 */}
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                {/* 狀態徽章 (帶框圓角小卡牌) */}
                <div className={`w-9 h-9 rounded-xl border-[2.5px] border-black flex items-center justify-center flex-shrink-0 shadow-[2px_2px_0px_#000] ${accentColor} transform -rotate-3`}>
                  <span className="text-lg leading-none">{icon}</span>
                </div>
                {/* 訊息本體 */}
                <div className="flex flex-col gap-1">
                  <span className="font-black text-sm md:text-base leading-snug tracking-wide whitespace-pre-line">
                    {toast.message}
                  </span>
                </div>
              </div>
              {/* 關閉按鈕 */}
              <button
                onClick={() => removeToast(toast.id)}
                className="w-7 h-7 flex items-center justify-center rounded-full border-2 border-black bg-white hover:bg-black hover:text-white flex-shrink-0 font-black text-xs shadow-[2px_2px_0px_#000] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] transition-all cursor-pointer"
                aria-label="Close notification"
              >
                ✕
              </button>
            </div>

            {/* 提示牌型 (改用獨立小分割區塊，更加穩定美觀，百分之百不切邊) */}
            {toast.suggestedType && (
              <div className="mt-1 border-t-2 border-dashed border-black/20 pt-3 flex items-center gap-2 animate-in slide-in-from-bottom-2 duration-300">
                <span className="text-[10px] md:text-xs font-black px-2 py-1 bg-white border-2 border-black rounded-lg shadow-[1.5px_1.5px_0px_#000] whitespace-nowrap">
                  💡 建議出牌
                </span>
                <span className="text-xs md:text-sm font-black text-[#2563eb] truncate">
                  {toast.suggestedType}
                </span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
