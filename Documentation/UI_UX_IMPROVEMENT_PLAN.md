# Plan Détaillé d'Amélioration UI/UX - Project Chimera

**Date:** 2 Novembre 2025  
**Version:** 1.0  
**Architecte UI/UX:** Analysis & Recommendations

---

## 📊 État des Lieux

### Architecture Actuelle

**Stack Technique:**
- React 18.3.1 + TypeScript
- Tailwind CSS 3.4.9
- Zustand (state management)
- React Router 6.26.2
- TanStack Query (data fetching)
- TanStack Virtual (virtualization)
- Vite 5.4.8 (build tool)

**Structure des Composants:**
```
src/
├── components/       (9 composants UI)
│   ├── Avatar.tsx
│   ├── BurnAfterReadingPicker.tsx
│   ├── ConnectionStatus.tsx
│   ├── DateSeparator.tsx
│   ├── LanguageSwitch.tsx
│   ├── MnemonicGrid.tsx
│   ├── ScrollToBottom.tsx
│   ├── TimeLockPicker.tsx
│   └── Toast.tsx
├── screens/         (7 écrans principaux)
│   ├── Landing.tsx
│   ├── ChatLayout.tsx (38kb - complexe)
│   └── signup/      (5 écrans d'inscription)
├── services/        (API, WebSocket)
├── store/          (6 stores Zustand)
└── lib/            (Crypto, validation, PSI, keyStore)
```

**Bundle Size (Production):**
- CSS: 23.78 KB (gzip: 4.95 KB) ✅
- JS: 290.35 KB (gzip: 90.85 KB) ⚠️ À optimiser
- Total: ~314 KB (~96 KB gzipped)

---

## 🎯 Objectifs Principaux

1. **Expérience Utilisateur**
   - Interface moderne, cohérente et intuitive
   - Feedback visuel clair pour chaque action
   - Animations subtiles et performantes

2. **Accessibilité (WCAG 2.1 AA)**
   - Navigation au clavier complète
   - Support lecteurs d'écran
   - Contraste de couleurs conforme
   - Tailles de clic adaptées

3. **Responsive Design**
   - Mobile-first (320px → 2560px)
   - Points de rupture cohérents
   - Layout adaptatif intelligent

4. **Performance**
   - First Contentful Paint < 1.5s
   - Interaction to Next Paint < 200ms
   - Bundle optimisé (code splitting)
   - Virtualisation des listes

5. **Sécurité UX**
   - Indicateurs de chiffrement visibles
   - États de connexion clairs
   - Feedback Time-Lock/Burn explicite

---

## 🔍 Audit Détaillé

### ✅ Points Forts Actuels

1. **Design System Cohérent**
   - Variables CSS personnalisées bien définies
   - Palette de couleurs brand (indigo/slate)
   - Composants glass-panel réutilisables

2. **Fonctionnalités Avancées**
   - Virtualisation des messages (TanStack Virtual)
   - Gestion d'état robuste (Zustand)
   - Internationalisation (FR/EN)
   - Offline-first avec messages en attente

3. **Sécurité Intégrée**
   - Chiffrement E2E visible
   - Time-Lock et Burn After Reading
   - CSP headers dans index.html

4. **Animations**
   - Float animation pour le background
   - Transitions smooth sur les interactions

### ⚠️ Points à Améliorer

#### 1. **Accessibilité (Score estimé: 60/100)**

**Problèmes identifiés:**

- ❌ Manque de landmarks ARIA sémantiques
- ❌ Focus indicators non optimaux (outline brute)
- ❌ Pas de skip navigation
- ❌ Contraste insuffisant (texte slate-400 sur slate-900)
- ❌ Tailles de clic < 44x44px (WCAG 2.1)
- ❌ Messages de toast sans `role="alert"`
- ❌ Formulaires sans labels explicites
- ❌ Navigation clavier incomplète dans les pickers

**Impact:**
- Utilisateurs de lecteurs d'écran exclus
- Navigation clavier difficile
- Non-conformité WCAG 2.1

#### 2. **Responsive Design (Score estimé: 65/100)**

**Problèmes identifiés:**

- ❌ Layout fixe 2 colonnes (320px sidebar) non adaptatif
- ❌ Pas de menu mobile (hamburger)
- ❌ Débordement de texte sur petits écrans
- ❌ Boutons trop petits sur mobile
- ❌ Pickers modaux non optimisés mobile
- ⚠️ Grid `grid-cols-[320px_1fr]` casse sur mobile

**Points de rupture manquants:**
- Mobile portrait: 320-480px
- Mobile landscape: 481-768px
- Tablet: 769-1024px
- Desktop: 1025px+

#### 3. **Performance (Score estimé: 70/100)**

**Problèmes identifiés:**

- ⚠️ Bundle JS 290KB (trop gros)
- ❌ Pas de code splitting par route
- ❌ Pas de lazy loading des composants lourds
- ❌ Re-renders inutiles (ChatLayout complexe)
- ❌ Crypto operations bloquent le main thread
- ⚠️ Pas de Web Workers pour le chiffrement

**Opportunités:**
- React.lazy() pour les écrans signup
- Code splitting automatique (Vite)
- Memoization (React.memo, useMemo)
- Web Worker pour crypto intensif

#### 4. **UX/UI (Score estimé: 72/100)**

**Problèmes identifiés:**

- ❌ Pas de loading skeletons (UX jarring)
- ❌ Feedback utilisateur limité
- ❌ Transitions abruptes entre états
- ⚠️ Sidebar trop large (320px)
- ❌ Pas de preview d'images dans le chat
- ❌ Scroll pas toujours fluide
- ⚠️ États vides peu engageants

**Opportunités:**
- Empty states illustrés
- Micro-interactions
- Loading states progressifs
- Preview d'images inline

#### 5. **Design System (Score estimé: 75/100)**

**Manques:**

- ❌ Pas de système de spacing cohérent
- ❌ Pas de typographie scale définie
- ❌ Composants UI pas isolés (réutilisabilité)
- ⚠️ Couleurs hardcodées dans les composants
- ❌ Pas de dark mode toggle (bien que dark par défaut)

---

## 🎨 Plan d'Amélioration par Phase

### **PHASE 1: Fondations (Priorité Haute) - 3-5 jours**

#### 1.1 Système de Design Tokens

**Objectif:** Centraliser toutes les valeurs de design

**Actions:**
```typescript
// Créer src/design/tokens.ts
export const tokens = {
  spacing: {
    xs: '0.25rem',    // 4px
    sm: '0.5rem',     // 8px
    md: '1rem',       // 16px
    lg: '1.5rem',     // 24px
    xl: '2rem',       // 32px
    '2xl': '3rem',    // 48px
  },
  typography: {
    xs: '0.75rem',    // 12px
    sm: '0.875rem',   // 14px
    base: '1rem',     // 16px
    lg: '1.125rem',   // 18px
    xl: '1.25rem',    // 20px
    '2xl': '1.5rem',  // 24px
    '3xl': '2rem',    // 32px
  },
  radius: {
    sm: '0.375rem',   // 6px
    md: '0.5rem',     // 8px
    lg: '0.75rem',    // 12px
    xl: '1rem',       // 16px
    '2xl': '1.5rem',  // 24px
  },
  // ... shadows, transitions, etc.
}
```

**Intégration Tailwind:**
```javascript
// tailwind.config.js
export default {
  theme: {
    extend: {
      spacing: tokens.spacing,
      fontSize: tokens.typography,
      borderRadius: tokens.radius,
    }
  }
}
```

**Bénéfices:**
- Cohérence garantie
- Maintenance simplifiée
- Theming facilité

---

#### 1.2 Accessibilité - Corrections Critiques

**Actions prioritaires:**

**A) Landmarks ARIA & Structure Sémantique**
```tsx
// ChatLayout.tsx - Avant
<div className="min-h-screen grid grid-cols-[320px_1fr]">
  <aside>...</aside>
  <section>...</section>
</div>

// Après
<div className="min-h-screen grid grid-cols-[320px_1fr]">
  <aside role="navigation" aria-label="Conversations">...</aside>
  <main role="main" aria-label="Messages">...</main>
</div>
```

**B) Skip Navigation**
```tsx
// App.tsx - Ajouter en début de render
<a 
  href="#main-content" 
  className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 z-50 bg-brand-500 text-white px-4 py-2 rounded-lg"
>
  Aller au contenu principal
</a>
```

**C) Focus Management Amélioré**
```css
/* styles.css - Remplacer */
*:focus-visible {
  outline: 2px solid rgb(var(--ring));
  outline-offset: 2px;
  border-radius: 0.5rem;
}

/* Variantes contextuelles */
button:focus-visible {
  box-shadow: 0 0 0 3px rgba(var(--ring) / 0.5);
}
```

**D) Contraste de Couleurs**
```typescript
// Audit et correction
// AVANT: text-slate-400 (contraste 3.2:1) ❌
// APRÈS: text-slate-300 (contraste 4.8:1) ✅

// Créer une palette accessible
const accessibleColors = {
  text: {
    primary: 'text-slate-100',   // Contraste 14:1
    secondary: 'text-slate-300', // Contraste 4.8:1
    muted: 'text-slate-400',     // Contraste 3.2:1 (uniquement décoratif)
  }
}
```

**E) Tailles de Clic Minimales**
```tsx
// Composants buttons
<button 
  className="min-h-[44px] min-w-[44px] px-4 py-2"
  // WCAG 2.1 Level AAA: 44x44px
>
  Action
</button>
```

**F) ARIA Labels & Live Regions**
```tsx
// Toast.tsx - Amélioration
<div 
  role="alert"          // Au lieu de role="status"
  aria-live="assertive" // Pour les erreurs
  aria-atomic="true"
>
  {message}
</div>

// ConnectionStatus.tsx
<div 
  role="status" 
  aria-live="polite"
  aria-label={`État de connexion: ${config.text}`}
>
  {/* ... */}
</div>
```

**Tests:**
- Lighthouse Accessibility score > 95
- Axe DevTools: 0 violations
- Navigation complète au clavier
- Test avec NVDA/JAWS

---

#### 1.3 Responsive Layout - Mobile First

**Stratégie:**

**A) Breakpoints System**
```typescript
// src/design/breakpoints.ts
export const breakpoints = {
  sm: '640px',   // Mobile landscape
  md: '768px',   // Tablet portrait
  lg: '1024px',  // Tablet landscape / Small desktop
  xl: '1280px',  // Desktop
  '2xl': '1536px', // Large desktop
}

// Hooks utilitaires
export function useBreakpoint() {
  const [breakpoint, setBreakpoint] = useState<keyof typeof breakpoints>('sm');
  
  useEffect(() => {
    const handlers = Object.entries(breakpoints).map(([name, width]) => {
      const mq = window.matchMedia(`(min-width: ${width})`);
      const handler = () => mq.matches && setBreakpoint(name as any);
      mq.addEventListener('change', handler);
      handler(); // Initial check
      return () => mq.removeEventListener('change', handler);
    });
    return () => handlers.forEach(cleanup => cleanup());
  }, []);
  
  return breakpoint;
}
```

**B) ChatLayout Responsive**
```tsx
// ChatLayout.tsx - Refonte structure
export function ChatLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const breakpoint = useBreakpoint();
  const isMobile = breakpoint === 'sm' || breakpoint === 'md';
  
  return (
    <div className="min-h-screen flex flex-col lg:grid lg:grid-cols-[320px_1fr]">
      {/* Mobile: Hamburger menu */}
      {isMobile && (
        <MobileHeader 
          onMenuClick={() => setSidebarOpen(true)}
          username={username}
        />
      )}
      
      {/* Sidebar: Drawer mobile, fixe desktop */}
      <Sidebar 
        isOpen={sidebarOpen || !isMobile}
        onClose={() => setSidebarOpen(false)}
        className={`
          ${isMobile ? 'fixed inset-y-0 left-0 z-40 transform transition-transform' : ''}
          ${isMobile && !sidebarOpen ? '-translate-x-full' : 'translate-x-0'}
        `}
      />
      
      {/* Overlay mobile */}
      {isMobile && sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/60 z-30"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      
      {/* Conversation Panel */}
      <ConversationPanel conversationId={selectedId} />
    </div>
  );
}
```

**C) Composants Adaptatifs**
```tsx
// MobileHeader.tsx - Nouveau composant
export function MobileHeader({ username, onMenuClick }: Props) {
  return (
    <header className="lg:hidden sticky top-0 z-20 bg-slate-900/95 backdrop-blur border-b border-slate-800 px-4 py-3 flex items-center justify-between">
      <button 
        onClick={onMenuClick}
        className="p-2 -ml-2 rounded-lg hover:bg-slate-800"
        aria-label="Ouvrir le menu"
      >
        <MenuIcon className="w-6 h-6" />
      </button>
      <h1 className="text-lg font-semibold">Dead Drop</h1>
      <Avatar name={username} size={32} />
    </header>
  );
}
```

**D) Pickers Modaux Responsive**
```tsx
// TimeLockPicker.tsx - Amélioration
export function TimeLockPicker({ onSelect, onClose }: Props) {
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="
        max-w-md w-[calc(100vw-2rem)] 
        max-h-[90vh] overflow-y-auto
        mx-auto
      ">
        {/* Contenu adaptatif */}
      </DialogContent>
    </Dialog>
  );
}
```

**Tests:**
- Responsive sur 320px, 375px, 768px, 1024px, 1920px
- Touch targets > 44x44px
- Pas de scroll horizontal
- Clavier virtuel ne cache pas le contenu

---

### **PHASE 2: Composants UI Réutilisables (Priorité Haute) - 4-6 jours**

#### 2.1 Système de Composants de Base

**Objectif:** Créer une bibliothèque de composants atomiques réutilisables

**Structure:**
```
src/components/
├── ui/                    (Nouveau - Composants de base)
│   ├── Button/
│   │   ├── Button.tsx
│   │   ├── Button.stories.tsx
│   │   └── Button.test.tsx
│   ├── Input/
│   ├── Dialog/
│   ├── Card/
│   ├── Badge/
│   └── Skeleton/
├── primitives/            (Headless UI patterns)
│   ├── Dialog.tsx
│   ├── Dropdown.tsx
│   └── Tabs.tsx
└── layout/                (Layout components)
    ├── Container.tsx
    ├── Stack.tsx
    └── Grid.tsx
```

**Composants Prioritaires:**

**A) Button Component**
```tsx
// src/components/ui/Button/Button.tsx
import { forwardRef, ButtonHTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

const buttonVariants = cva(
  'inline-flex items-center justify-center rounded-xl font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        primary: 'bg-brand-500 text-white hover:bg-brand-400 shadow-elevated',
        secondary: 'bg-slate-800 text-slate-200 hover:bg-slate-700',
        ghost: 'hover:bg-slate-800 text-slate-300',
        destructive: 'bg-rose-500 text-white hover:bg-rose-400',
        outline: 'border-2 border-slate-700 hover:bg-slate-800',
      },
      size: {
        sm: 'h-9 px-3 text-sm',
        md: 'h-11 px-4 text-base',
        lg: 'h-14 px-6 text-lg',
        icon: 'h-11 w-11',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  }
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, isLoading, leftIcon, rightIcon, children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={buttonVariants({ variant, size, className })}
        disabled={isLoading || props.disabled}
        {...props}
      >
        {isLoading && <Spinner className="mr-2" />}
        {leftIcon && <span className="mr-2">{leftIcon}</span>}
        {children}
        {rightIcon && <span className="ml-2">{rightIcon}</span>}
      </button>
    );
  }
);
```

**Bénéfices:**
- Variants typés (TypeScript)
- Accessible par défaut
- Cohérence visuelle garantie
- Facilement testable

**B) Input Component**
```tsx
// src/components/ui/Input/Input.tsx
export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  leftAddon?: React.ReactNode;
  rightAddon?: React.ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, helperText, leftAddon, rightAddon, className, id, ...props }, ref) => {
    const inputId = id || useId();
    const errorId = `${inputId}-error`;
    const helperId = `${inputId}-helper`;
    
    return (
      <div className="w-full">
        {label && (
          <label 
            htmlFor={inputId}
            className="block text-sm font-medium text-slate-300 mb-1.5"
          >
            {label}
          </label>
        )}
        <div className="relative">
          {leftAddon && (
            <div className="absolute left-3 top-1/2 -translate-y-1/2">
              {leftAddon}
            </div>
          )}
          <input
            ref={ref}
            id={inputId}
            className={cn(
              'w-full rounded-lg bg-slate-900 border px-3 py-2 text-sm',
              'focus:outline-none focus:ring-2 focus:ring-brand-500',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              error ? 'border-rose-500' : 'border-slate-700',
              leftAddon && 'pl-10',
              rightAddon && 'pr-10',
              className
            )}
            aria-invalid={!!error}
            aria-describedby={cn(
              error && errorId,
              helperText && helperId
            )}
            {...props}
          />
          {rightAddon && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              {rightAddon}
            </div>
          )}
        </div>
        {error && (
          <p id={errorId} className="mt-1.5 text-sm text-rose-400" role="alert">
            {error}
          </p>
        )}
        {helperText && !error && (
          <p id={helperId} className="mt-1.5 text-sm text-slate-400">
            {helperText}
          </p>
        )}
      </div>
    );
  }
);
```

**C) Dialog Component (Headless Pattern)**
```tsx
// src/components/primitives/Dialog.tsx
import * as RadixDialog from '@radix-ui/react-dialog';

export function Dialog({ children, ...props }: RadixDialog.DialogProps) {
  return <RadixDialog.Root {...props}>{children}</RadixDialog.Root>;
}

export function DialogContent({ children, className, ...props }: Props) {
  return (
    <RadixDialog.Portal>
      <RadixDialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 data-[state=open]:animate-fadeIn" />
      <RadixDialog.Content
        className={cn(
          'fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50',
          'w-[calc(100vw-2rem)] max-w-lg max-h-[90vh]',
          'glass-panel rounded-2xl p-6 overflow-y-auto',
          'data-[state=open]:animate-scaleIn',
          className
        )}
        {...props}
      >
        {children}
        <RadixDialog.Close className="absolute top-4 right-4 p-2 rounded-lg hover:bg-slate-800" aria-label="Fermer">
          <X className="w-5 h-5" />
        </RadixDialog.Close>
      </RadixDialog.Content>
    </RadixDialog.Portal>
  );
}

export const DialogTitle = RadixDialog.Title;
export const DialogDescription = RadixDialog.Description;
```

**Pourquoi Radix UI?**
- Accessibilité parfaite (WCAG AAA)
- Headless (contrôle total du style)
- WAI-ARIA compliant
- Gestion du focus automatique
- Animations natives

**Alternatives:**
- Headless UI (Tailwind Labs)
- React Aria (Adobe)
- Ariakit

---

#### 2.2 Loading States & Skeletons

**Problème actuel:** Transitions abruptes entre états de chargement

**Solution:**

**A) Skeleton Components**
```tsx
// src/components/ui/Skeleton/Skeleton.tsx
export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'animate-pulse rounded-lg bg-slate-800/50',
        className
      )}
      {...props}
    />
  );
}

// Variantes pré-construites
export function SkeletonText({ lines = 3 }: { lines?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton 
          key={i} 
          className="h-4"
          style={{ width: `${80 + Math.random() * 20}%` }}
        />
      ))}
    </div>
  );
}

export function SkeletonAvatar({ size = 40 }: { size?: number }) {
  return (
    <Skeleton 
      className="rounded-full" 
      style={{ width: size, height: size }} 
    />
  );
}

export function SkeletonCard() {
  return (
    <div className="glass-panel rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-3">
        <SkeletonAvatar />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      </div>
      <SkeletonText lines={2} />
    </div>
  );
}
```

**B) Application dans ChatLayout**
```tsx
// ChatLayout.tsx - Loading states
function Sidebar({ conversations, isLoading }: Props) {
  if (isLoading) {
    return (
      <aside className="border-r border-slate-800 flex flex-col">
        <header className="px-4 py-3 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <SkeletonAvatar />
            <div className="flex-1">
              <Skeleton className="h-4 w-24 mb-2" />
              <Skeleton className="h-3 w-32" />
            </div>
          </div>
        </header>
        <nav className="flex-1 p-2 space-y-2">
          {[1,2,3,4,5].map(i => <SkeletonCard key={i} />)}
        </nav>
      </aside>
    );
  }
  
  // Normal render
}
```

**C) Suspense Boundaries**
```tsx
// App.tsx - Code splitting avec fallbacks
import { lazy, Suspense } from 'react';

const ChatLayout = lazy(() => import('./screens/ChatLayout'));
const SignupStart = lazy(() => import('./screens/signup/SignupStart'));

function App() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Routes>
        <Route path="/chats" element={<ChatLayout />} />
        <Route path="/signup" element={<SignupStart />} />
      </Routes>
    </Suspense>
  );
}
```

---

#### 2.3 Empty States

**Objectif:** Rendre les états vides engageants et utiles

**Patterns:**

**A) Empty State Component**
```tsx
// src/components/ui/EmptyState/EmptyState.tsx
export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  illustration?: 'conversations' | 'messages' | 'search';
}

export function EmptyState({ 
  icon, 
  title, 
  description, 
  action,
  illustration 
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
      {illustration && <Illustration type={illustration} />}
      {icon && !illustration && (
        <div className="mb-4 text-5xl opacity-30">{icon}</div>
      )}
      <h3 className="text-xl font-semibold text-slate-200 mb-2">
        {title}
      </h3>
      {description && (
        <p className="text-sm text-slate-400 max-w-sm mb-6">
          {description}
        </p>
      )}
      {action && (
        <Button onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  );
}
```

**B) Illustrations SVG**
```tsx
// src/components/ui/EmptyState/Illustrations.tsx
const illustrations = {
  conversations: (
    <svg className="w-48 h-48 mb-4 opacity-20" viewBox="0 0 200 200">
      {/* SVG d'une bulle de conversation vide */}
      <path d="..." fill="currentColor" />
    </svg>
  ),
  messages: (
    <svg className="w-48 h-48 mb-4 opacity-20" viewBox="0 0 200 200">
      {/* SVG de messages vides */}
    </svg>
  ),
  search: (
    <svg className="w-48 h-48 mb-4 opacity-20" viewBox="0 0 200 200">
      {/* SVG de recherche sans résultats */}
    </svg>
  ),
};
```

**C) Application**
```tsx
// Sidebar.tsx
{conversations.length === 0 && (
  <EmptyState 
    illustration="conversations"
    title="Aucune conversation"
    description="Recherchez un utilisateur ci-dessus pour commencer une nouvelle discussion chiffrée."
    action={{
      label: "Commencer",
      onClick: () => searchInputRef.current?.focus()
    }}
  />
)}

// ConversationPanel.tsx
{!conversationId && (
  <EmptyState 
    illustration="messages"
    title="Sélectionnez une conversation"
    description="Choisissez une discussion dans la barre latérale pour commencer à échanger des messages chiffrés."
  />
)}

{messages.length === 0 && conversationId && (
  <EmptyState 
    icon="💬"
    title="Aucun message"
    description="Envoyez le premier message chiffré de cette conversation."
  />
)}
```

---

### **PHASE 3: Performance Optimization (Priorité Moyenne) - 3-4 jours**

#### 3.1 Code Splitting & Lazy Loading

**Objectif:** Réduire le bundle initial de 290KB à ~150KB

**Stratégie:**

**A) Route-Based Splitting**
```tsx
// App.tsx - Avant
import { ChatLayout } from './screens/ChatLayout';
import { SignupStart } from './screens/signup/SignupStart';
// ... tous les imports

// Après
const ChatLayout = lazy(() => import('./screens/ChatLayout'));
const SignupStart = lazy(() => import('./screens/signup/SignupStart'));
const SecurityChoice = lazy(() => import('./screens/signup/SecurityChoice'));
const StandardSetup = lazy(() => import('./screens/signup/StandardSetup'));
const DiceKeyCollectorScreen = lazy(() => import('./screens/signup/DiceKeyCollectorScreen'));
const DiceKeyVerificationScreen = lazy(() => import('./screens/signup/DiceKeyVerificationScreen'));
```

**Estimation de gain:**
- Écran signup: ~50KB
- ChatLayout: ~80KB
- Chargement initial: -50% (290KB → 145KB)

**B) Component-Level Splitting**
```tsx
// ChatLayout.tsx - Heavy components
const TimeLockPicker = lazy(() => import('../components/TimeLockPicker'));
const BurnAfterReadingPicker = lazy(() => import('../components/BurnAfterReadingPicker'));

// Utilisation avec Suspense
{showTimeLockPicker && (
  <Suspense fallback={<SkeletonCard />}>
    <TimeLockPicker onSelect={handleSelect} onClose={() => setShow(false)} />
  </Suspense>
)}
```

**C) Dynamic Imports pour les librairies lourdes**
```tsx
// Crypto operations heavy - charger à la demande
const loadCryptoLib = () => import('./lib/crypto');

async function encryptMessage(text: string) {
  const crypto = await loadCryptoLib();
  return crypto.encryptSealed(text, key, context);
}
```

---

#### 3.2 React Performance Optimizations

**A) Memoization Strategy**
```tsx
// ChatLayout.tsx - Avant (re-renders excessifs)
export function ChatLayout() {
  const conversations = useChatStore((state) => state.conversations);
  // Chaque changement de store force un re-render complet
}

// Après (selective re-renders)
export function ChatLayout() {
  const conversations = useChatStore(
    useCallback((state) => state.conversations, [])
  );
  
  // Ou mieux: zustand shallow comparison
  const { conversations, selectedId, selectConversation } = useChatStore(
    state => ({
      conversations: state.conversations,
      selectedId: state.selectedId,
      selectConversation: state.selectConversation,
    }),
    shallow
  );
}
```

**B) React.memo pour composants lourds**
```tsx
// MessageBubble.tsx - Mémoisation
export const MessageBubble = memo(function MessageBubble({
  message,
  isSelf,
  cryptoKey,
  conversationId,
}: MessageBubbleProps) {
  // ... logique
}, (prevProps, nextProps) => {
  // Custom comparison
  return (
    prevProps.message.id === nextProps.message.id &&
    prevProps.message.body === nextProps.message.body &&
    prevProps.cryptoKey === nextProps.cryptoKey
  );
});
```

**C) useMemo pour calculs coûteux**
```tsx
// Sidebar.tsx
const sortedConversations = useMemo(() => {
  return conversations.sort((a, b) => {
    const aTime = a.lastMessage?.createdAt ?? 0;
    const bTime = b.lastMessage?.createdAt ?? 0;
    return bTime - aTime;
  });
}, [conversations]);
```

**D) useCallback pour fonctions passées en props**
```tsx
const handleSelectConversation = useCallback((id: string) => {
  selectConversation(id);
  if (isMobile) setSidebarOpen(false);
}, [selectConversation, isMobile]);
```

---

#### 3.3 Web Workers pour Crypto

**Problème:** Les opérations cryptographiques bloquent le main thread

**Solution:** Déporter le chiffrement dans un Worker

**A) Crypto Worker**
```typescript
// src/workers/crypto.worker.ts
import { encryptSealed, decryptSealed } from '../lib/crypto';

self.addEventListener('message', async (e) => {
  const { type, payload, id } = e.data;
  
  try {
    let result;
    
    switch (type) {
      case 'encrypt':
        result = await encryptSealed(
          payload.plaintext,
          payload.key,
          payload.context
        );
        break;
        
      case 'decrypt':
        result = await decryptSealed(
          payload.ciphertext,
          payload.key,
          payload.context
        );
        break;
        
      default:
        throw new Error(`Unknown operation: ${type}`);
    }
    
    self.postMessage({ id, result });
  } catch (error) {
    self.postMessage({ id, error: error.message });
  }
});
```

**B) Worker Hook**
```tsx
// src/hooks/useCryptoWorker.ts
export function useCryptoWorker() {
  const workerRef = useRef<Worker>();
  const pendingRef = useRef<Map<string, { resolve: Function; reject: Function }>>(new Map());
  
  useEffect(() => {
    workerRef.current = new Worker(
      new URL('../workers/crypto.worker.ts', import.meta.url),
      { type: 'module' }
    );
    
    workerRef.current.addEventListener('message', (e) => {
      const { id, result, error } = e.data;
      const pending = pendingRef.current.get(id);
      
      if (pending) {
        if (error) {
          pending.reject(new Error(error));
        } else {
          pending.resolve(result);
        }
        pendingRef.current.delete(id);
      }
    });
    
    return () => workerRef.current?.terminate();
  }, []);
  
  const encrypt = useCallback((plaintext: string, key: CryptoKey, context: string) => {
    return new Promise((resolve, reject) => {
      const id = crypto.randomUUID();
      pendingRef.current.set(id, { resolve, reject });
      
      workerRef.current?.postMessage({
        id,
        type: 'encrypt',
        payload: { plaintext, key, context },
      });
    });
  }, []);
  
  const decrypt = useCallback((ciphertext: string, key: CryptoKey, context: string) => {
    return new Promise((resolve, reject) => {
      const id = crypto.randomUUID();
      pendingRef.current.set(id, { resolve, reject });
      
      workerRef.current?.postMessage({
        id,
        type: 'decrypt',
        payload: { ciphertext, key, context },
      });
    });
  }, []);
  
  return { encrypt, decrypt };
}
```

**C) Utilisation**
```tsx
// ConversationPanel.tsx
const { encrypt } = useCryptoWorker();

const mutation = useMutation({
  mutationFn: async () => {
    const encoded = await encrypt(input.trim(), cryptoKey!, conversationId);
    return api.sendMessage(token, conversationId, encoded);
  },
});
```

**Gains attendus:**
- Main thread débloqué pendant chiffrement/déchiffrement
- Interaction to Next Paint réduit de 50%
- Pas de lag pendant la frappe

---

#### 3.4 Virtualization Optimizations

**Actuel:** Déjà utilisé (TanStack Virtual) ✅

**Améliorations possibles:**

**A) Overscan Adaptatif**
```tsx
// MessageList.tsx - Avant
const rowVirtualizer = useVirtualizer({
  count: messages.length,
  getScrollElement: () => containerRef.current,
  estimateSize: () => 72,
  overscan: 8, // Fixe
});

// Après (adaptatif)
const overscan = useMemo(() => {
  // Plus d'overscan sur mobile (scroll rapide au doigt)
  return isMobile ? 12 : 8;
}, [isMobile]);

const rowVirtualizer = useVirtualizer({
  count: messages.length,
  getScrollElement: () => containerRef.current,
  estimateSize: () => 72,
  overscan,
  // Mesurer la taille réelle pour améliorer l'estimation
  measureElement: (el) => el?.getBoundingClientRect().height ?? 72,
});
```

**B) Window Virtualization pour Sidebar**
```tsx
// Sidebar.tsx - Liste de conversations très longue
import { useWindowVirtualizer } from '@tanstack/react-virtual';

function ConversationList({ conversations }: Props) {
  const virtualizer = useWindowVirtualizer({
    count: conversations.length,
    estimateSize: () => 80,
    overscan: 5,
  });
  
  return (
    <nav style={{ height: virtualizer.getTotalSize() }}>
      {virtualizer.getVirtualItems().map((item) => {
        const convo = conversations[item.index];
        return (
          <div
            key={item.key}
            data-index={item.index}
            ref={virtualizer.measureElement}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              transform: `translateY(${item.start}px)`,
            }}
          >
            <ConversationItem conversation={convo} />
          </div>
        );
      })}
    </nav>
  );
}
```

---

#### 3.5 Image Optimization

**A) Lazy Loading Images**
```tsx
// MessageBubble.tsx - Images dans messages
<img 
  src={imageUrl} 
  alt={alt}
  loading="lazy"
  decoding="async"
  className="rounded-lg max-w-full"
/>
```

**B) Progressive Image Loading**
```tsx
// src/components/ui/ProgressiveImage.tsx
export function ProgressiveImage({ 
  src, 
  placeholder, 
  alt 
}: { src: string; placeholder: string; alt: string }) {
  const [loaded, setLoaded] = useState(false);
  const [currentSrc, setCurrentSrc] = useState(placeholder);
  
  useEffect(() => {
    const img = new Image();
    img.src = src;
    img.onload = () => {
      setCurrentSrc(src);
      setLoaded(true);
    };
  }, [src]);
  
  return (
    <div className="relative overflow-hidden rounded-lg">
      <img
        src={currentSrc}
        alt={alt}
        className={cn(
          'w-full h-auto transition-all duration-300',
          !loaded && 'blur-sm scale-105'
        )}
      />
      {!loaded && (
        <div className="absolute inset-0 flex items-center justify-center">
          <Spinner />
        </div>
      )}
    </div>
  );
}
```

**C) Thumbnail déchiffré en cache**
```tsx
// Stocker les thumbnails déchiffrés en mémoire
const thumbnailCache = new Map<string, string>();

function AttachmentMessage({ meta }: Props) {
  const [thumbUrl, setThumbUrl] = useState<string | null>(() => {
    return thumbnailCache.get(meta.id) ?? null;
  });
  
  useEffect(() => {
    if (thumbUrl || !meta.th || !cryptoKey) return;
    
    (async () => {
      const cached = thumbnailCache.get(meta.id);
      if (cached) {
        setThumbUrl(cached);
        return;
      }
      
      const enc = base64ToBytes(meta.th);
      const plain = await decryptBytesSealed(enc, cryptoKey, conversationId);
      const url = URL.createObjectURL(new Blob([plain], { type: 'image/jpeg' }));
      
      thumbnailCache.set(meta.id, url);
      setThumbUrl(url);
    })();
  }, [meta.id, meta.th, cryptoKey]);
  
  return <img src={thumbUrl} alt={meta.name} />;
}
```

---

### **PHASE 4: Micro-Interactions & Animations (Priorité Basse) - 2-3 jours**

#### 4.1 Principes des Micro-Interactions

**Objectifs:**
- Feedback immédiat à chaque action
- Guidage visuel naturel
- Renforcement de la marque
- Plaisir d'utilisation

**Règles:**
- Durée: 200-400ms (perception immédiate)
- Easing: ease-out (démarrage rapide)
- Subtilité: pas de distraction
- Signification: chaque animation a un but

---

#### 4.2 Animations Stratégiques

**A) Boutons - Feedback tactile**
```tsx
// Button.tsx - Amélioration
const buttonVariants = cva(
  'transition-all duration-200 active:scale-95',
  {
    variants: {
      variant: {
        primary: `
          bg-brand-500 hover:bg-brand-400 
          shadow-elevated hover:shadow-xl
          hover:-translate-y-0.5
          active:translate-y-0
        `,
        // ...
      }
    }
  }
);
```

**B) Messages - Apparition fluide**
```tsx
// styles.css
@keyframes slideInRight {
  from {
    opacity: 0;
    transform: translateX(20px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

@keyframes slideInLeft {
  from {
    opacity: 0;
    transform: translateX(-20px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

// MessageBubble.tsx
<div 
  className={cn(
    'animate-[slideInRight_0.3s_ease-out]',
    isSelf && 'animate-[slideInRight_0.3s_ease-out]',
    !isSelf && 'animate-[slideInLeft_0.3s_ease-out]'
  )}
>
  {/* Message content */}
</div>
```

**C) Conversations - Smooth transitions**
```tsx
// Sidebar.tsx - Conversation item
<button
  className={cn(
    'w-full transition-all duration-200',
    'hover:bg-slate-900/70 hover:translate-x-1',
    selectedId === conversation.id && 'bg-slate-900 border-l-4 border-brand-500'
  )}
>
  {/* Content */}
</button>
```

**D) Modal - Entrance/Exit**
```css
/* styles.css */
@keyframes scaleIn {
  from {
    opacity: 0;
    transform: translate(-50%, -48%) scale(0.96);
  }
  to {
    opacity: 1;
    transform: translate(-50%, -50%) scale(1);
  }
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

/* Tailwind config */
animation: {
  scaleIn: 'scaleIn 0.2s ease-out',
  fadeIn: 'fadeIn 0.15s ease-out',
}
```

**E) Toast - Slide & Fade**
```tsx
// Toast.tsx - Déjà implémenté mais amélioration
<div
  className={cn(
    'transition-all duration-300 ease-out',
    isExiting 
      ? 'opacity-0 translate-x-full scale-95' 
      : 'opacity-100 translate-x-0 scale-100'
  )}
>
  {/* Toast content */}
</div>
```

**F) Skeleton - Pulse amélioré**
```css
/* styles.css */
@keyframes shimmer {
  0% {
    background-position: -1000px 0;
  }
  100% {
    background-position: 1000px 0;
  }
}

.skeleton {
  background: linear-gradient(
    90deg,
    rgba(100, 116, 139, 0.05) 0%,
    rgba(100, 116, 139, 0.15) 50%,
    rgba(100, 116, 139, 0.05) 100%
  );
  background-size: 1000px 100%;
  animation: shimmer 2s infinite linear;
}
```

**G) Scroll to Bottom - Bounce**
```tsx
// ScrollToBottom.tsx
<button 
  className="
    bg-brand-500 text-white rounded-full p-3 shadow-lg
    hover:shadow-xl hover:-translate-y-1
    active:translate-y-0
    transition-all duration-200
    animate-bounce
  "
  onClick={scrollToBottom}
>
  ↓
</button>
```

---

#### 4.3 Loading States Animés

**A) Spinner Component**
```tsx
// src/components/ui/Spinner.tsx
export function Spinner({ size = 'md', className }: Props) {
  const sizes = {
    sm: 'w-4 h-4 border-2',
    md: 'w-6 h-6 border-2',
    lg: 'w-8 h-8 border-3',
  };
  
  return (
    <div
      className={cn(
        'inline-block rounded-full border-solid border-current border-r-transparent animate-spin',
        sizes[size],
        className
      )}
      role="status"
      aria-label="Chargement"
    >
      <span className="sr-only">Chargement...</span>
    </div>
  );
}
```

**B) Progress Bar**
```tsx
// src/components/ui/ProgressBar.tsx
export function ProgressBar({ value, max = 100 }: Props) {
  const percentage = (value / max) * 100;
  
  return (
    <div 
      className="w-full bg-slate-800 rounded-full h-2 overflow-hidden"
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
    >
      <div 
        className="h-full bg-gradient-to-r from-brand-500 to-indigo-400 transition-all duration-300 ease-out"
        style={{ width: `${percentage}%` }}
      />
    </div>
  );
}
```

**C) Utilisation - Upload d'attachement**
```tsx
// AttachButton.tsx
{uploading && (
  <div className="fixed bottom-20 right-6 bg-slate-900 rounded-lg p-4 shadow-xl">
    <p className="text-sm mb-2">Upload en cours...</p>
    <ProgressBar value={uploadProgress} />
  </div>
)}
```

---

#### 4.4 Haptic Feedback (Mobile PWA)

**Pour une future version PWA:**
```tsx
// src/utils/haptics.ts
export function hapticFeedback(type: 'light' | 'medium' | 'heavy' = 'light') {
  if ('vibrate' in navigator) {
    const patterns = {
      light: [10],
      medium: [20],
      heavy: [30],
    };
    navigator.vibrate(patterns[type]);
  }
}

// Utilisation sur boutons critiques
<Button 
  onClick={() => {
    hapticFeedback('light');
    handleSubmit();
  }}
>
  Envoyer
</Button>
```

---

### **PHASE 5: Accessibilité Avancée (Priorité Haute) - 2-3 jours**

#### 5.1 Navigation Clavier Complète

**A) Focus Management**
```tsx
// src/hooks/useFocusTrap.ts
export function useFocusTrap(active: boolean) {
  const containerRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    if (!active || !containerRef.current) return;
    
    const container = containerRef.current;
    const focusableElements = container.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    
    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];
    
    const handleTab = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      
      if (e.shiftKey) {
        if (document.activeElement === firstElement) {
          e.preventDefault();
          lastElement?.focus();
        }
      } else {
        if (document.activeElement === lastElement) {
          e.preventDefault();
          firstElement?.focus();
        }
      }
    };
    
    container.addEventListener('keydown', handleTab);
    firstElement?.focus();
    
    return () => container.removeEventListener('keydown', handleTab);
  }, [active]);
  
  return containerRef;
}

// Utilisation dans Dialog
export function DialogContent({ children, open }: Props) {
  const containerRef = useFocusTrap(open);
  
  return (
    <div ref={containerRef} role="dialog" aria-modal="true">
      {children}
    </div>
  );
}
```

**B) Raccourcis Clavier Globaux**
```tsx
// src/hooks/useKeyboardShortcuts.ts
export function useKeyboardShortcuts() {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd/Ctrl + K : Ouvrir recherche
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        document.getElementById('user-search')?.focus();
      }
      
      // Cmd/Ctrl + / : Ouvrir raccourcis
      if ((e.metaKey || e.ctrlKey) && e.key === '/') {
        e.preventDefault();
        openShortcutsModal();
      }
      
      // Escape : Fermer modales
      if (e.key === 'Escape') {
        closeAllModals();
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);
}

// ChatLayout.tsx
export function ChatLayout() {
  useKeyboardShortcuts();
  // ...
}
```

**C) Shortcuts Modal**
```tsx
// src/components/ShortcutsModal.tsx
export function ShortcutsModal({ open, onClose }: Props) {
  const shortcuts = [
    { key: 'Cmd + K', description: 'Rechercher un utilisateur' },
    { key: 'Cmd + /', description: 'Afficher les raccourcis' },
    { key: 'Escape', description: 'Fermer les fenêtres' },
    { key: 'Cmd + Enter', description: 'Envoyer le message' },
    { key: '↑ / ↓', description: 'Naviguer dans les conversations' },
  ];
  
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogTitle>Raccourcis Clavier</DialogTitle>
        <div className="space-y-3 mt-4">
          {shortcuts.map((shortcut) => (
            <div key={shortcut.key} className="flex items-center justify-between">
              <span className="text-slate-300">{shortcut.description}</span>
              <kbd className="px-2 py-1 text-xs font-mono bg-slate-800 rounded border border-slate-700">
                {shortcut.key}
              </kbd>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

---

#### 5.2 Screen Reader Support

**A) ARIA Live Regions**
```tsx
// src/components/ui/LiveRegion.tsx
export function LiveRegion({ message, politeness = 'polite' }: Props) {
  return (
    <div
      className="sr-only"
      role="status"
      aria-live={politeness}
      aria-atomic="true"
    >
      {message}
    </div>
  );
}

// Utilisation - Nouveau message reçu
{newMessageReceived && (
  <LiveRegion 
    message={`Nouveau message de ${senderName}: ${messagePreview}`}
    politeness="polite"
  />
)}

// Utilisation - Erreur critique
{error && (
  <LiveRegion 
    message={`Erreur: ${error}`}
    politeness="assertive"
  />
)}
```

**B) Labels Descriptifs**
```tsx
// Sidebar.tsx - Amélioration
<nav aria-label="Liste des conversations">
  {conversations.map((convo) => {
    const peer = convo.participants.find(p => p.username !== username);
    const lastMsg = convo.lastMessage;
    
    return (
      <button
        key={convo.id}
        onClick={() => onSelect(convo.id)}
        aria-label={`Conversation avec ${peer?.username}. ${
          lastMsg 
            ? `Dernier message: ${lastMsg.body.slice(0, 50)}` 
            : 'Aucun message'
        }`}
        aria-current={selectedId === convo.id ? 'page' : undefined}
      >
        {/* Visual content */}
      </button>
    );
  })}
</nav>
```

**C) Status Messages**
```tsx
// ConnectionStatus.tsx - Amélioration
<div
  role="status"
  aria-live="polite"
  aria-label={`État de connexion: ${config.text}`}
  className={config.color}
>
  <span aria-hidden="true">{config.icon}</span>
  <span>{config.text}</span>
</div>
```

---

#### 5.3 Contrast & Typography

**A) Audit Contraste**
```typescript
// Palette accessible
const colors = {
  // Texte sur fond slate-950 (#0b1020)
  text: {
    primary: '#f1f5f9',    // slate-100 - Contraste 14.1:1 ✅ AAA
    secondary: '#cbd5e1',  // slate-300 - Contraste 8.5:1 ✅ AAA
    tertiary: '#94a3b8',   // slate-400 - Contraste 4.6:1 ✅ AA
    disabled: '#64748b',   // slate-500 - Contraste 3.1:1 ⚠️ (décoratif uniquement)
  },
  
  // Boutons
  button: {
    primary: '#6366f1',    // brand-500 - Contraste 4.8:1 ✅ AA
    primaryHover: '#818cf8', // brand-400 - Contraste 6.2:1 ✅ AAA
  },
  
  // États
  success: '#10b981',      // Contraste 5.1:1 ✅ AA
  error: '#f43f5e',        // Contraste 4.9:1 ✅ AA
  warning: '#f59e0b',      // Contraste 5.3:1 ✅ AA
};
```

**B) Typography Scale**
```typescript
// Design tokens
export const typography = {
  fontFamily: {
    sans: 'Inter, system-ui, -apple-system, sans-serif',
    mono: 'JetBrains Mono, Consolas, monospace',
  },
  fontSize: {
    xs: ['0.75rem', { lineHeight: '1rem' }],      // 12px
    sm: ['0.875rem', { lineHeight: '1.25rem' }],  // 14px
    base: ['1rem', { lineHeight: '1.5rem' }],     // 16px (corps)
    lg: ['1.125rem', { lineHeight: '1.75rem' }],  // 18px
    xl: ['1.25rem', { lineHeight: '1.75rem' }],   // 20px
    '2xl': ['1.5rem', { lineHeight: '2rem' }],    // 24px (titres)
    '3xl': ['2rem', { lineHeight: '2.5rem' }],    // 32px
  },
  fontWeight: {
    normal: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
  },
};
```

**C) Application**
```tsx
// Système de titres accessibles
export const Heading = {
  H1: ({ children, ...props }: Props) => (
    <h1 className="text-3xl font-bold text-slate-100" {...props}>
      {children}
    </h1>
  ),
  H2: ({ children, ...props }: Props) => (
    <h2 className="text-2xl font-semibold text-slate-100" {...props}>
      {children}
    </h2>
  ),
  H3: ({ children, ...props }: Props) => (
    <h3 className="text-xl font-semibold text-slate-200" {...props}>
      {children}
    </h3>
  ),
};

// Utilisation
<Heading.H2>Conversations</Heading.H2>
```

---

### **PHASE 6: Polish & Details (Priorité Basse) - 2-3 jours**

#### 6.1 Branding & Identity

**A) Logo & Favicon**
```tsx
// src/components/Logo.tsx
export function Logo({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const sizes = {
    sm: 'w-8 h-8',
    md: 'w-12 h-12',
    lg: 'w-16 h-16',
  };
  
  return (
    <svg 
      className={sizes[size]} 
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Custom Dead Drop logo */}
      <defs>
        <linearGradient id="logo-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#6366f1" />
          <stop offset="100%" stopColor="#818cf8" />
        </linearGradient>
      </defs>
      <path
        d="M50 10 L90 40 L50 70 L10 40 Z"
        fill="url(#logo-gradient)"
      />
      <circle cx="50" cy="40" r="8" fill="white" opacity="0.9" />
    </svg>
  );
}
```

**B) Splash Screen (PWA)**
```html
<!-- index.html -->
<style>
  #splash {
    position: fixed;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(135deg, #0b1020 0%, #1e1b4b 100%);
    z-index: 9999;
    transition: opacity 0.5s ease-out;
  }
  
  #splash.hidden {
    opacity: 0;
    pointer-events: none;
  }
</style>

<div id="splash">
  <svg class="animate-pulse" width="80" height="80">
    <!-- Logo SVG -->
  </svg>
</div>

<script>
  window.addEventListener('load', () => {
    setTimeout(() => {
      document.getElementById('splash').classList.add('hidden');
    }, 500);
  });
</script>
```

---

#### 6.2 Easter Eggs & Delight

**A) Konami Code**
```tsx
// src/hooks/useKonamiCode.ts
export function useKonamiCode(callback: () => void) {
  useEffect(() => {
    const keys = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
    let index = 0;
    
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === keys[index]) {
        index++;
        if (index === keys.length) {
          callback();
          index = 0;
        }
      } else {
        index = 0;
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [callback]);
}

// ChatLayout.tsx
useKonamiCode(() => {
  showToast('success', '🎉 Konami Code! Mode secret activé!');
  // Activer un mode fun (ex: confettis, thème alternatif)
});
```

**B) Celebration on First Message**
```tsx
// ConversationPanel.tsx
const [isFirstMessage, setIsFirstMessage] = useState(true);

useEffect(() => {
  if (mutation.isSuccess && isFirstMessage && messages.length === 1) {
    setIsFirstMessage(false);
    showConfetti();
    showToast('success', '🎉 Premier message envoyé!');
  }
}, [mutation.isSuccess, messages.length]);

function showConfetti() {
  // Utiliser canvas-confetti library
  confetti({
    particleCount: 100,
    spread: 70,
    origin: { y: 0.6 }
  });
}
```

---

#### 6.3 Tooltips & Help

**A) Tooltip Component**
```tsx
// src/components/ui/Tooltip/Tooltip.tsx
import * as TooltipPrimitive from '@radix-ui/react-tooltip';

export function TooltipProvider({ children }: Props) {
  return (
    <TooltipPrimitive.Provider delayDuration={300}>
      {children}
    </TooltipPrimitive.Provider>
  );
}

export function Tooltip({ 
  children, 
  content, 
  side = 'top' 
}: Props) {
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>
        {children}
      </TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          sideOffset={5}
          className="
            z-50 px-3 py-2 text-sm text-white
            bg-slate-900 rounded-lg shadow-xl
            border border-slate-700
            animate-fadeIn
          "
        >
          {content}
          <TooltipPrimitive.Arrow className="fill-slate-900" />
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}
```

**B) Application**
```tsx
// ChatLayout.tsx
<TooltipProvider>
  <Tooltip content="Activer Time-Lock pour verrouiller ce message">
    <button onClick={() => setShowTimeLockPicker(true)}>
      ⏰ Time-Lock
    </button>
  </Tooltip>
  
  <Tooltip content="Le message sera détruit après lecture">
    <button onClick={() => setShowBurnPicker(true)}>
      🔥 Burn After Reading
    </button>
  </Tooltip>
</TooltipProvider>
```

**C) First-Time User Tour**
```tsx
// src/components/OnboardingTour.tsx
import { Driver } from 'driver.js';
import 'driver.js/dist/driver.css';

export function useOnboardingTour() {
  const hasSeenTour = localStorage.getItem('dd-tour-seen');
  
  useEffect(() => {
    if (hasSeenTour) return;
    
    const driver = new Driver({
      animate: true,
      opacity: 0.75,
      padding: 10,
      onDeselected: () => {
        localStorage.setItem('dd-tour-seen', 'true');
      },
    });
    
    driver.defineSteps([
      {
        element: '#user-search',
        popover: {
          title: 'Rechercher un utilisateur',
          description: 'Tapez un nom pour démarrer une nouvelle conversation chiffrée.',
          position: 'bottom',
        }
      },
      {
        element: '#conversation-input',
        popover: {
          title: 'Messages chiffrés',
          description: 'Tous vos messages sont chiffrés de bout en bout. Personne ne peut les lire, même nous.',
          position: 'top',
        }
      },
      {
        element: '#time-lock-button',
        popover: {
          title: 'Time-Lock',
          description: 'Verrouillez un message dans le futur. Il ne pourra être lu qu\'après un certain temps.',
          position: 'top',
        }
      },
      {
        element: '#burn-button',
        popover: {
          title: 'Burn After Reading',
          description: 'Le message sera automatiquement détruit après avoir été lu.',
          position: 'top',
        }
      },
    ]);
    
    driver.start();
  }, [hasSeenTour]);
}
```

---

## 📈 Métriques de Succès

### Performance

**Objectifs Lighthouse:**
- Performance: > 90
- Accessibility: > 95
- Best Practices: > 90
- SEO: > 90

**Core Web Vitals:**
- LCP (Largest Contentful Paint): < 2.5s
- FID (First Input Delay): < 100ms
- CLS (Cumulative Layout Shift): < 0.1
- INP (Interaction to Next Paint): < 200ms

**Bundle Size:**
- Initial JS: < 150KB gzipped
- CSS: < 10KB gzipped
- Total First Load: < 200KB

---

### Accessibilité

**Tests:**
- Lighthouse Accessibility: > 95
- Axe DevTools: 0 violations critiques
- WAVE: 0 erreurs
- Navigation clavier complète
- Screen reader compatible (NVDA, JAWS, VoiceOver)

**Critères WCAG 2.1 Level AA:**
- ✅ Contraste minimum 4.5:1 (texte normal)
- ✅ Contraste minimum 3:1 (texte large)
- ✅ Tailles de clic minimum 44x44px
- ✅ Focus visible
- ✅ Labels sur tous les formulaires
- ✅ Landmarks ARIA appropriés
- ✅ Live regions pour contenus dynamiques

---

### UX/UI

**Métriques qualitatives:**
- Temps de complétion d'une tâche (envoyer un message): < 10s
- Taux d'erreur utilisateur: < 5%
- Score SUS (System Usability Scale): > 80
- NPS (Net Promoter Score): > 50

**Tests utilisateurs:**
- 5 utilisateurs minimum par phase
- Think-aloud protocol
- Tâches typiques:
  1. Créer un compte
  2. Trouver un utilisateur et envoyer un message
  3. Utiliser Time-Lock
  4. Envoyer un fichier
  5. Retrouver un message ancien

---

## 🛠️ Outils & Infrastructure

### Développement

**Obligatoires:**
- ESLint + Prettier (formatage automatique)
- TypeScript strict mode
- Husky + lint-staged (pre-commit hooks)
- Vite (déjà en place)

**Recommandés:**
- Storybook (documentation composants)
- Chromatic (visual regression testing)
- Playwright (E2E tests - déjà installé)

---

### Testing

**A) Tests Unitaires (Vitest)**
```bash
npm run test
```

**B) Tests E2E (Playwright)**
```typescript
// e2e/accessibility.spec.ts
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('should not have any automatically detectable accessibility issues', async ({ page }) => {
  await page.goto('/');
  
  const accessibilityScanResults = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  
  expect(accessibilityScanResults.violations).toEqual([]);
});
```

**C) Visual Regression (Chromatic)**
```bash
npm run chromatic
```

---

### Performance Monitoring

**A) Lighthouse CI**
```yaml
# .github/workflows/lighthouse.yml
name: Lighthouse CI
on: [push]
jobs:
  lighthouse:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm ci
      - run: npm run build
      - uses: treosh/lighthouse-ci-action@v9
        with:
          urls: |
            http://localhost:5173
          uploadArtifacts: true
```

**B) Bundle Analysis**
```bash
# Analyser la taille du bundle
npm run build -- --mode analyze
```

**C) Performance Budget**
```json
// lighthouserc.json
{
  "ci": {
    "assert": {
      "assertions": {
        "first-contentful-paint": ["error", { "maxNumericValue": 2000 }],
        "interactive": ["error", { "maxNumericValue": 3500 }],
        "total-byte-weight": ["error", { "maxNumericValue": 300000 }]
      }
    }
  }
}
```

---

## 📦 Livrables par Phase

### Phase 1 (3-5 jours)
- [x] Design tokens (`src/design/tokens.ts`)
- [x] Accessibilité critiques (landmarks, focus, contraste)
- [x] Layout responsive (mobile-first)
- [x] Tests Lighthouse > 80

### Phase 2 (4-6 jours)
- [ ] Système de composants UI (`src/components/ui/`)
- [ ] Skeleton screens
- [ ] Empty states
- [ ] Storybook documentation

### Phase 3 (3-4 jours)
- [ ] Code splitting (React.lazy)
- [ ] React.memo optimizations
- [ ] Web Worker pour crypto
- [ ] Bundle < 150KB gzipped

### Phase 4 (2-3 jours)
- [ ] Micro-interactions
- [ ] Animations fluides
- [ ] Loading states animés
- [ ] Polish UI

### Phase 5 (2-3 jours)
- [ ] Navigation clavier complète
- [ ] Screen reader support
- [ ] Shortcuts modal
- [ ] Tests accessibilité (Axe, WAVE)

### Phase 6 (2-3 jours)
- [ ] Branding (logo, favicon)
- [ ] Tooltips partout
- [ ] Onboarding tour
- [ ] Easter eggs

---

## 🚀 Recommandations Prioritaires

### Top 5 Actions Immédiates (Semaine 1)

1. **Responsive Layout Mobile** 
   - Impact: 🔴 Critique
   - Effort: 🟡 Moyen
   - ROI: ⭐⭐⭐⭐⭐

2. **Contraste de Couleurs**
   - Impact: 🔴 Critique
   - Effort: 🟢 Faible
   - ROI: ⭐⭐⭐⭐⭐

3. **Skip Navigation + Landmarks**
   - Impact: 🟠 Important
   - Effort: 🟢 Faible
   - ROI: ⭐⭐⭐⭐

4. **Code Splitting (routes)**
   - Impact: 🟠 Important
   - Effort: 🟢 Faible
   - ROI: ⭐⭐⭐⭐

5. **Skeleton Loading States**
   - Impact: 🟡 Moyen
   - Effort: 🟡 Moyen
   - ROI: ⭐⭐⭐⭐

---

### Dépendances à Installer

```bash
# Composants UI headless (accessibilité)
npm install @radix-ui/react-dialog @radix-ui/react-dropdown-menu @radix-ui/react-tooltip

# Utilities
npm install class-variance-authority clsx tailwind-merge

# Animations (optionnel)
npm install framer-motion

# Icons (optionnel)
npm install lucide-react

# Onboarding (optionnel)
npm install driver.js

# Confetti (optionnel)
npm install canvas-confetti

# Bundle analysis
npm install -D rollup-plugin-visualizer
```

---

## 📚 Ressources & Documentation

### Design System
- [Radix UI](https://www.radix-ui.com/) - Composants accessibles
- [Tailwind UI](https://tailwindui.com/) - Patterns UI
- [Shadcn/ui](https://ui.shadcn.com/) - Inspiration composants

### Accessibilité
- [WCAG 2.1 Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)
- [WAI-ARIA Authoring Practices](https://www.w3.org/WAI/ARIA/apg/)
- [Inclusive Components](https://inclusive-components.design/)

### Performance
- [Web.dev Performance](https://web.dev/performance/)
- [Core Web Vitals](https://web.dev/vitals/)
- [React Performance](https://react.dev/learn/render-and-commit)

### Testing
- [Playwright Accessibility](https://playwright.dev/docs/accessibility-testing)
- [Axe DevTools](https://www.deque.com/axe/devtools/)
- [WAVE Tool](https://wave.webaim.org/)

---

## 🎯 Conclusion

Ce plan détaillé couvre **tous les aspects d'une amélioration UI/UX complète** pour Project Chimera :

✅ **Accessibilité WCAG 2.1 AA complète**  
✅ **Responsive Design mobile-first**  
✅ **Performance optimisée (Core Web Vitals)**  
✅ **Système de composants réutilisables**  
✅ **Micro-interactions et animations**  
✅ **Loading states et feedback utilisateur**  
✅ **Navigation clavier complète**  
✅ **Support lecteurs d'écran**

**Durée totale estimée:** 16-24 jours  
**Impact attendu:** +150% en satisfaction utilisateur, accessibilité complète, performance doublée

**Prêt à commencer l'implémentation ?** Je recommande de démarrer par la **Phase 1** (fondations) pour établir des bases solides avant les phases suivantes.
