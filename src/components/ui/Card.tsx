import React from 'react';
import { Card as CardType } from '@/lib/big2Logic';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface CardProps {
  card: CardType;
  size?: 'small' | 'medium' | 'large';
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
  spades: 'text-black',
  hearts: 'text-red-500',
  diamonds: 'text-red-500',
  clubs: 'text-black',
};

const suitBgColors: Record<CardType['suit'], string> = {
  spades: 'bg-white',
  hearts: 'bg-red-50',
  diamonds: 'bg-red-50',
  clubs: 'bg-white',
};

const sizeClasses = {
  small: 'w-10 h-14 text-base',
  medium: 'w-14 h-20 text-lg md:text-xl',
  large: 'w-16 h-24 text-xl md:text-2xl',
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
  return (
    <div 
      onClick={onClick}
      style={style}
      className={cn(
        'relative flex-shrink-0 border-[3px] border-black rounded-xl overflow-hidden transition-all duration-200 cursor-pointer select-none',
        suitBgColors[card.suit],
        sizeClasses[size],
        selected ? '-translate-y-4 shadow-[4px_6px_0px_#000] border-b-4 border-black border-opacity-100 z-20' : 'hover:-translate-y-2 shadow-[2px_2px_0px_#000] hover:z-10 hover:shadow-[4px_6px_0px_#000]',
        !isPlayable && 'opacity-50 grayscale',
        className
      )}
    >
      {/* 點數在左上 */}
      <div className={cn("absolute top-2 left-2 font-black leading-none", suitColors[card.suit])}>
        {card.rank}
      </div>
      {/* 花色在右下 */}
      <div className={cn("absolute bottom-2 right-2 leading-none", suitColors[card.suit])}>
        {suitSymbols[card.suit]}
      </div>
    </div>
  );
};
