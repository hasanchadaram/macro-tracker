// Avatar options and helpers for Macro Tracker
// =============================================================================

import { ImageSourcePropType } from 'react-native';

export type AvatarSeries = 'All' | 'KonoSuba' | 'Black Clover';

export interface AvatarOption {
  id: string;
  name: string;
  character: string;
  series: 'Account' | 'KonoSuba' | 'Black Clover';
  description: string;
  role?: string;
  themeColor: string;
  image?: ImageSourcePropType;
  isDefault?: boolean;
}

export const AVATAR_OPTIONS: AvatarOption[] = [
  {
    id: 'default',
    name: 'Default',
    character: 'Google Profile',
    series: 'Account',
    description: 'Your Google account photo or initial',
    themeColor: '#6366F1',
    isDefault: true,
  },
  // ── KonoSuba Characters ─────────────────────────────────────
  {
    id: 'kazuma',
    name: 'Kazuma Satou',
    character: 'Kazuma',
    series: 'KonoSuba',
    description: 'Witty and clever adventurer from Axel',
    themeColor: '#10B981',
    image: require('../assets/images/avatars/kazuma.jpg'),
  },
  {
    id: 'aqua',
    name: 'Aqua',
    character: 'Aqua',
    series: 'KonoSuba',
    description: 'The cheerful Goddess of Water',
    themeColor: '#0EA5E9',
    image: require('../assets/images/avatars/aqua.jpg'),
  },
  {
    id: 'megumin',
    name: 'Megumin',
    character: 'Megumin',
    series: 'KonoSuba',
    description: 'Archmage of the Crimson Demons',
    themeColor: '#EF4444',
    image: require('../assets/images/avatars/megumin.jpg'),
  },
  {
    id: 'darkness',
    name: 'Darkness',
    character: 'Darkness',
    series: 'KonoSuba',
    description: 'The noble Crusader Knight',
    themeColor: '#F59E0B',
    image: require('../assets/images/avatars/darkness.jpg'),
  },
  // ── Black Clover Characters ─────────────────────────────────
  {
    id: 'asta',
    name: 'Asta',
    character: 'Asta',
    series: 'Black Clover',
    description: 'Never gives up! Black Bulls Magic Knight',
    themeColor: '#F97316',
    image: require('../assets/images/avatars/asta.jpg'),
  },
  {
    id: 'yuno',
    name: 'Yuno Grinberryall',
    character: 'Yuno',
    series: 'Black Clover',
    description: 'Chosen by the four-leaf clover • Golden Dawn',
    themeColor: '#14B8A6',
    image: require('../assets/images/avatars/yuno.jpg'),
  },
  {
    id: 'noelle',
    name: 'Noelle Silva',
    character: 'Noelle',
    series: 'Black Clover',
    description: 'Royal water magic prodigy of the Black Bulls',
    themeColor: '#3B82F6',
    image: require('../assets/images/avatars/noelle.jpg'),
  },
  {
    id: 'yami',
    name: 'Yami Sukehiro',
    character: 'Yami',
    series: 'Black Clover',
    description: 'Surpass your limits! Captain of the Black Bulls',
    themeColor: '#8B5CF6',
    image: require('../assets/images/avatars/yami.jpg'),
  },
];

export function getAvatarById(id?: string | null): AvatarOption {
  if (!id || id === 'default') return AVATAR_OPTIONS[0];
  return AVATAR_OPTIONS.find((a) => a.id.toLowerCase() === id.toLowerCase()) || AVATAR_OPTIONS[0];
}
