import React from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  BadgeDollarSign, Baby, BanknoteArrowDown, BookOpen, BriefcaseBusiness, Building2,
  CarTaxiFront, Coins, Coffee, CreditCard, Dumbbell, Droplets,
  Fuel, Gamepad2, Gift, GraduationCap, HandHeart, HeartPulse, Hotel, House,
  Landmark, LineChart, ParkingSquare, PartyPopper, PencilRuler, PiggyBank, Plane,
  Presentation, ReceiptText, RotateCcw, ShieldCheck, ShoppingBag, ShoppingBasket,
  Sofa, Sparkles, Tag, TrendingUp, Utensils, WalletCards, Wifi, Wrench, Zap,
} from 'lucide-react';
import type { CategoryIconKey } from '../../shared/category';

const icons: Record<CategoryIconKey, LucideIcon> = {
  utensils: Utensils,
  coffee: Coffee,
  'shopping-basket': ShoppingBasket,
  house: House,
  zap: Zap,
  droplets: Droplets,
  wifi: Wifi,
  fuel: Fuel,
  parking: ParkingSquare,
  taxi: CarTaxiFront,
  'heart-pulse': HeartPulse,
  shield: ShieldCheck,
  baby: Baby,
  wrench: Wrench,
  sofa: Sofa,
  plane: Plane,
  'shopping-bag': ShoppingBag,
  gamepad: Gamepad2,
  sparkles: Sparkles,
  dumbbell: Dumbbell,
  party: PartyPopper,
  hotel: Hotel,
  chart: LineChart,
  'piggy-bank': PiggyBank,
  coins: Coins,
  building: Building2,
  landmark: Landmark,
  briefcase: BriefcaseBusiness,
  book: BookOpen,
  graduation: GraduationCap,
  presentation: Presentation,
  'pencil-ruler': PencilRuler,
  gift: Gift,
  'hand-heart': HandHeart,
  'credit-card': CreditCard,
  banknote: BanknoteArrowDown,
  receipt: ReceiptText,
  wallet: WalletCards,
  'badge-dollar': BadgeDollarSign,
  'trending-up': TrendingUp,
  'rotate-ccw': RotateCcw,
  tag: Tag,
};

export function CategoryIcon({
  name,
  className = 'h-4 w-4',
}: {
  name?: string;
  className?: string;
}) {
  const Icon = icons[(name as CategoryIconKey) || 'tag'] || Tag;
  return <Icon aria-hidden="true" className={className} />;
}
