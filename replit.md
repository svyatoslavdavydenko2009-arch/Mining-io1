# Cave Miner - Replit Agent Guide

## Overview

Cave Miner is a browser-based pixel art mining game built with a React frontend and Express backend. Players explore procedurally generated cave environments, mine resources (stone, copper, iron, gold, diamond), upgrade pickaxes, and manage inventory. The game features retro pixel art aesthetics with custom UI components styled to match the theme.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter (lightweight alternative to React Router)
- **State Management**: TanStack Query (React Query) for server state caching and synchronization
- **Styling**: Tailwind CSS with custom pixel art theme, CSS variables for theming
- **UI Components**: shadcn/ui component library (Radix UI primitives) with custom pixel-styled wrappers (PixelButton, PixelCard, PixelInput)
- **Animations**: Framer Motion for smooth transitions
- **Build Tool**: Vite with path aliases (@/, @shared/, @assets/)

### Backend Architecture
- **Framework**: Express.js with TypeScript
- **Authentication**: Passport.js with local strategy, session-based auth using express-session
- **Password Hashing**: Node.js crypto module (scrypt)
- **Session Storage**: MemoryStore (development), connect-pg-simple available for production
- **API Design**: RESTful endpoints defined in shared/routes.ts with Zod schemas for validation

### Data Storage
- **Database**: PostgreSQL with Drizzle ORM
- **Schema Location**: shared/schema.ts (shared between frontend and backend)
- **Migrations**: Drizzle Kit (`npm run db:push`)
- **User Data**: Stores username, hashed password, position (x, y), pickaxe level, inventory (JSONB)

### Key Design Patterns
- **Shared Types**: Schema and API route definitions in /shared folder used by both client and server
- **Optimistic Updates**: Client-side position updates with eventual server sync
- **Procedural Generation**: Deterministic world generation using seeded pseudo-random function
- **Component Architecture**: Custom pixel-styled wrapper components around shadcn/ui primitives

### Game Mechanics
- Grid-based movement system
- Resource mining based on pickaxe level requirements
- Crafting system for pickaxe upgrades
- Procedural world generation with rarity tiers

## External Dependencies

### Database
- PostgreSQL (required, connection via DATABASE_URL environment variable)
- Drizzle ORM for type-safe database operations

### Authentication
- express-session for session management
- passport and passport-local for authentication strategy

### UI/Styling
- Radix UI primitives (via shadcn/ui)
- Tailwind CSS with custom configuration
- Google Fonts: Press Start 2P (headings), VT323 (body text)

### Development
- Vite dev server with HMR
- Replit-specific plugins (cartographer, dev-banner, runtime-error-modal)
- esbuild for production server bundling

### Environment Variables Required
- `DATABASE_URL`: PostgreSQL connection string
- `SESSION_SECRET`: Secret for session encryption (optional, has default)