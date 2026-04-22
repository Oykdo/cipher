export type EmojiCategoryId = 'people' | 'nature' | 'food' | 'activity' | 'objects';

export interface EmojiEntry {
  emoji: string;
  keywords: string[];
}

export interface EmojiCategory {
  id: EmojiCategoryId;
  icon: string;
  labelKey: string;
  emojis: EmojiEntry[];
}

export const EMOJI_CATALOG: EmojiCategory[] = [
  {
    id: 'people',
    icon: '🙂',
    labelKey: 'messages.emoji_people',
    emojis: [
      { emoji: '😀', keywords: ['happy', 'smile', 'joy'] },
      { emoji: '😁', keywords: ['grin', 'smile', 'teeth'] },
      { emoji: '😂', keywords: ['laugh', 'tears', 'funny'] },
      { emoji: '🤣', keywords: ['rolling', 'laugh', 'funny'] },
      { emoji: '😊', keywords: ['blush', 'happy', 'warm'] },
      { emoji: '😍', keywords: ['love', 'eyes', 'heart'] },
      { emoji: '😘', keywords: ['kiss', 'love'] },
      { emoji: '😎', keywords: ['cool', 'sunglasses'] },
      { emoji: '🤔', keywords: ['thinking', 'hmm'] },
      { emoji: '🤗', keywords: ['hug', 'support'] },
      { emoji: '😴', keywords: ['sleep', 'tired'] },
      { emoji: '😭', keywords: ['cry', 'sad', 'tears'] },
      { emoji: '😡', keywords: ['angry', 'mad'] },
      { emoji: '🥳', keywords: ['party', 'celebration'] },
      { emoji: '🙏', keywords: ['thanks', 'pray', 'respect'] },
      { emoji: '❤️', keywords: ['heart', 'love'] },
    ],
  },
  {
    id: 'nature',
    icon: '🌿',
    labelKey: 'messages.emoji_nature',
    emojis: [
      { emoji: '🌞', keywords: ['sun', 'bright', 'day'] },
      { emoji: '🌙', keywords: ['moon', 'night'] },
      { emoji: '⭐', keywords: ['star', 'favorite'] },
      { emoji: '🔥', keywords: ['fire', 'hot'] },
      { emoji: '✨', keywords: ['sparkles', 'magic'] },
      { emoji: '⚡', keywords: ['lightning', 'energy'] },
      { emoji: '☔', keywords: ['rain', 'umbrella'] },
      { emoji: '❄️', keywords: ['snow', 'cold'] },
      { emoji: '🌈', keywords: ['rainbow', 'color'] },
      { emoji: '🌸', keywords: ['flower', 'spring'] },
      { emoji: '🌹', keywords: ['rose', 'flower'] },
      { emoji: '🌴', keywords: ['palm', 'vacation'] },
      { emoji: '🍀', keywords: ['luck', 'clover'] },
      { emoji: '🐶', keywords: ['dog', 'pet'] },
      { emoji: '🐱', keywords: ['cat', 'pet'] },
      { emoji: '🦊', keywords: ['fox', 'animal'] },
    ],
  },
  {
    id: 'food',
    icon: '🍕',
    labelKey: 'messages.emoji_food',
    emojis: [
      { emoji: '☕', keywords: ['coffee', 'drink'] },
      { emoji: '🍵', keywords: ['tea', 'drink'] },
      { emoji: '🍎', keywords: ['apple', 'fruit'] },
      { emoji: '🍓', keywords: ['strawberry', 'fruit'] },
      { emoji: '🍕', keywords: ['pizza', 'food'] },
      { emoji: '🍔', keywords: ['burger', 'food'] },
      { emoji: '🍟', keywords: ['fries', 'food'] },
      { emoji: '🌮', keywords: ['taco', 'food'] },
      { emoji: '🍣', keywords: ['sushi', 'food'] },
      { emoji: '🍜', keywords: ['ramen', 'noodles'] },
      { emoji: '🍪', keywords: ['cookie', 'dessert'] },
      { emoji: '🍰', keywords: ['cake', 'dessert'] },
      { emoji: '🍫', keywords: ['chocolate', 'sweet'] },
      { emoji: '🍿', keywords: ['popcorn', 'movie'] },
      { emoji: '🥂', keywords: ['cheers', 'celebration'] },
      { emoji: '🍷', keywords: ['wine', 'drink'] },
    ],
  },
  {
    id: 'activity',
    icon: '⚽',
    labelKey: 'messages.emoji_activity',
    emojis: [
      { emoji: '⚽', keywords: ['football', 'soccer'] },
      { emoji: '🏀', keywords: ['basketball', 'sport'] },
      { emoji: '🎮', keywords: ['gaming', 'game'] },
      { emoji: '🎧', keywords: ['music', 'headphones'] },
      { emoji: '🎬', keywords: ['movie', 'cinema'] },
      { emoji: '🎯', keywords: ['target', 'focus'] },
      { emoji: '🚀', keywords: ['rocket', 'launch'] },
      { emoji: '✈️', keywords: ['travel', 'plane'] },
      { emoji: '🏆', keywords: ['trophy', 'win'] },
      { emoji: '🎉', keywords: ['party', 'celebration'] },
      { emoji: '🎁', keywords: ['gift', 'present'] },
      { emoji: '📚', keywords: ['books', 'study'] },
      { emoji: '💻', keywords: ['computer', 'work'] },
      { emoji: '🛠️', keywords: ['tools', 'build'] },
      { emoji: '🎨', keywords: ['art', 'paint'] },
      { emoji: '🧩', keywords: ['puzzle', 'game'] },
    ],
  },
  {
    id: 'objects',
    icon: '💡',
    labelKey: 'messages.emoji_objects',
    emojis: [
      { emoji: '📱', keywords: ['phone', 'mobile'] },
      { emoji: '⌚', keywords: ['watch', 'time'] },
      { emoji: '🔒', keywords: ['lock', 'secure'] },
      { emoji: '🔑', keywords: ['key', 'access'] },
      { emoji: '💡', keywords: ['idea', 'light'] },
      { emoji: '💎', keywords: ['gem', 'diamond'] },
      { emoji: '💬', keywords: ['message', 'chat'] },
      { emoji: '📎', keywords: ['attachment', 'paperclip'] },
      { emoji: '📌', keywords: ['pin', 'mark'] },
      { emoji: '📷', keywords: ['camera', 'photo'] },
      { emoji: '🔔', keywords: ['bell', 'notification'] },
      { emoji: '🕯️', keywords: ['candle', 'light'] },
      { emoji: '🧠', keywords: ['brain', 'idea'] },
      { emoji: '🪙', keywords: ['coin', 'crypto'] },
      { emoji: '🧸', keywords: ['toy', 'soft'] },
      { emoji: '📝', keywords: ['note', 'write'] },
    ],
  },
];
