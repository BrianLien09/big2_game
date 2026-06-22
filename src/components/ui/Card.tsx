import React from 'react';
import { Card as CardType } from '@/lib/big2Logic';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface CardProps {
  card: CardType;
  size?: 'mobile' | 'tablet' | 'desktop' | 'small' | 'medium' | 'large';
  selected?: boolean;
  onClick?: () => void;
  className?: string;
  style?: React.CSSProperties;
  isPlayable?: boolean; 
}

const suitSymbols: Record<CardType['suit'], string> = {
  spades: '♠',
  hearts: '♥',
  diamonds: '♦',
  clubs: '♣',
};

const suitColors: Record<CardType['suit'], string> = {
  spades: 'text-[#111]',
  hearts: 'text-[#ef3340]',
  diamonds: 'text-[#ef3340]',
  clubs: 'text-[#111]',
};

// 為了大幅提升手機端遊玩時的清晰度與操作易用性，我們將卡片尺寸從 56x84px 再次放大至 62x92px，並同步調整相關字型與佈局
const sizeClasses = {
  desktop: 'w-[84px] h-[122px] border-[4px] border-[#111] rounded-[15px] shadow-[4px_5px_0_#111]',
  tablet: 'w-[64px] h-[92px] border-[4px] border-[#111] rounded-[12px] shadow-[3px_4px_0_#111]',
  mobile: 'w-[62px] h-[92px] border-[4px] border-[#111] rounded-[12px] shadow-[3px_4px_0_#111]',
};

const topCornerPos = {
  desktop: 'top-[8px] left-[8px] gap-[1px]',
  tablet: 'top-[6px] left-[6px] gap-[0px]',
  mobile: 'top-[6px] left-[6px] gap-[0px]',
};

const rankSizes = {
  desktop: 'text-[22px]',
  tablet: 'text-[18px]',
  mobile: 'text-[18px]',
};

const smallSuitSize = {
  desktop: 'text-[17px]',
  tablet: 'text-[12px]',
  mobile: 'text-[12px]',
};

const largeSuitSize = {
  desktop: 'text-[27px] bottom-[6px] right-[8px]',
  tablet: 'text-[28px] bottom-[4px] right-[6px]',
  mobile: 'text-[26px] bottom-[4px] right-[6px]',
};

export const PlayingCard: React.FC<CardProps> = ({ 
  card, 
  size = 'medium', 
  selected = false,
  onClick,
  className,
  style,
  isPlayable = true
}) => {
  // 將舊尺寸名稱映射到新尺寸
  const resolvedSize = (() => {
    if (size === 'small') return 'mobile';
    if (size === 'large') return 'desktop';
    if (size === 'medium') return 'tablet';
    return size;
  })();

  return (
    <div 
      onClick={onClick}
      style={style}
      className={cn(
        'playing-card relative flex-shrink-0 transition-all duration-200 cursor-pointer select-none bg-white box-border overflow-hidden',
        sizeClasses[resolvedSize],
        selected ? 'selected' : '',
        !isPlayable && 'opacity-50 grayscale',
        className
      )}
    >
      {/* 左上角資訊：Rank + 小花色，直向排列 */}
      <div className={cn("card-corner card-corner-top absolute flex flex-col items-center justify-start leading-[0.95]", topCornerPos[resolvedSize], suitColors[card.suit])}>
        <span className={cn("card-rank font-[900] tracking-tighter", rankSizes[resolvedSize])}>{card.rank}</span>
        <span className={cn("card-suit-small font-black", smallSuitSize[resolvedSize])}>{suitSymbols[card.suit]}</span>
      </div>

      {/* 右下角：大型花色 */}
      <span className={cn("card-suit-large absolute leading-none select-none pointer-events-none", largeSuitSize[resolvedSize], suitColors[card.suit])}>
        {suitSymbols[card.suit]}
      </span>
    </div>
  );
};
