import {
  Award,
  Banknote,
  Coffee,
  CreditCard,
  Gamepad2,
  HeartPulse,
  Home,
  Landmark,
  MoreHorizontal,
  PlusCircle,
  Repeat,
  ShoppingBag,
  Smartphone,
  Train,
  TrendingUp,
  Utensils,
  Wallet,
} from 'lucide-react';

interface CategoryIconProps {
  name: string;
  size?: number;
}

export function CategoryIcon({ name, size = 18 }: CategoryIconProps) {
  switch (name) {
    case 'utensils':
      return <Utensils size={size} />;
    case 'train':
      return <Train size={size} />;
    case 'shopping-bag':
      return <ShoppingBag size={size} />;
    case 'home':
      return <Home size={size} />;
    case 'gamepad-2':
      return <Gamepad2 size={size} />;
    case 'heart-pulse':
      return <HeartPulse size={size} />;
    case 'repeat':
      return <Repeat size={size} />;
    case 'coffee':
      return <Coffee size={size} />;
    case 'wallet':
      return <Wallet size={size} />;
    case 'award':
      return <Award size={size} />;
    case 'trending-up':
      return <TrendingUp size={size} />;
    case 'plus-circle':
      return <PlusCircle size={size} />;
    case 'credit-card':
      return <CreditCard size={size} />;
    case 'landmark':
      return <Landmark size={size} />;
    case 'banknote':
      return <Banknote size={size} />;
    case 'smartphone':
      return <Smartphone size={size} />;
    default:
      return <MoreHorizontal size={size} />;
  }
}

export function getAccountIconName(type: 'cash' | 'bank' | 'ewallet' | 'credit_card'): string {
  switch (type) {
    case 'cash':
      return 'banknote';
    case 'bank':
      return 'landmark';
    case 'ewallet':
      return 'smartphone';
    case 'credit_card':
      return 'credit-card';
  }
}
