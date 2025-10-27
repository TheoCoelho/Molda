// src/hooks/use-recent-fonts.ts
import { useState, useEffect, useCallback } from 'react';

const RECENT_FONTS_KEY = 'molda_recent_fonts';
const PROJECT_SESSION_KEY = 'molda_current_project_session';
const MAX_RECENT_FONTS = 20; // Máximo de fontes recentes a manter

interface RecentFont {
  family: string;
  lastUsed: string; // ISO string
  usageCount: number;
}

interface ProjectSession {
  id: string;
  startedAt: string;
  lastActivity: string;
}

// Gera um ID único para a sessão do projeto
function generateProjectSessionId(): string {
  return `project_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Verifica se a sessão atual ainda é válida (menos de 4 horas de inatividade)
function isSessionValid(session: ProjectSession): boolean {
  const lastActivity = new Date(session.lastActivity);
  const now = new Date();
  const hoursInMs = 4 * 60 * 60 * 1000; // 4 horas ao invés de 1
  return (now.getTime() - lastActivity.getTime()) < hoursInMs;
}

export function useRecentFonts() {
  const [recentFonts, setRecentFontsState] = useState<RecentFont[]>([]);
  const [currentSession, setCurrentSession] = useState<ProjectSession | null>(null);

  const broadcastRecentFonts = useCallback((fonts: RecentFont[]) => {
    if (typeof window === "undefined") return;
    const payload = fonts.map((item) => ({ ...item }));
    const dispatch = () => {
      try {
        window.dispatchEvent(
          new CustomEvent("recent-fonts:updated", { detail: { fonts: payload } })
        );
      } catch {}
    };

    if (typeof queueMicrotask === "function") queueMicrotask(dispatch);
    else setTimeout(dispatch, 0);
  }, []);

  const updateRecentFontsState = useCallback(
    (
      updater: RecentFont[] | ((prev: RecentFont[]) => RecentFont[]),
      options?: { silent?: boolean }
    ) => {
      setRecentFontsState((prev) => {
        const next = typeof updater === "function" ? (updater as (p: RecentFont[]) => RecentFont[])(prev) : updater;
        if (!options?.silent) {
          broadcastRecentFonts(next);
        }
        return next;
      });
    },
    [broadcastRecentFonts]
  );

  // Função para iniciar uma nova sessão do projeto
  const startNewSession = useCallback(() => {
    const newSession: ProjectSession = {
      id: generateProjectSessionId(),
      startedAt: new Date().toISOString(),
      lastActivity: new Date().toISOString(),
    };

    setCurrentSession(newSession);
    updateRecentFontsState([], { silent: false }); // Limpa fontes recentes e sincroniza

    try {
      localStorage.setItem(PROJECT_SESSION_KEY, JSON.stringify(newSession));
      localStorage.removeItem(RECENT_FONTS_KEY); // Remove fontes recentes do localStorage
    } catch (error) {
      console.warn('Erro ao iniciar nova sessão:', error);
    }
  }, [updateRecentFontsState]);

  // Atualiza a última atividade da sessão
  const updateLastActivity = useCallback((sessionId?: string) => {
    if (!currentSession && !sessionId) return;
    
    const id = sessionId || currentSession?.id;
    if (!id) return;

    const updatedSession: ProjectSession = {
      id,
      startedAt: currentSession?.startedAt || new Date().toISOString(),
      lastActivity: new Date().toISOString(),
    };
    
    setCurrentSession(updatedSession);
    
    try {
      localStorage.setItem(PROJECT_SESSION_KEY, JSON.stringify(updatedSession));
    } catch (error) {
      console.warn('Erro ao atualizar última atividade:', error);
    }
  }, [currentSession]);

  // Inicializa ou continua a sessão do projeto
  useEffect(() => {
    try {
      const storedSession = localStorage.getItem(PROJECT_SESSION_KEY);
      
      if (storedSession) {
        const session = JSON.parse(storedSession) as ProjectSession;
        
        if (isSessionValid(session)) {
          // Sessão válida - continua a sessão atual
          setCurrentSession(session);
          updateLastActivity(session.id);
        } else {
          // Sessão expirada - inicia nova sessão mas mantém fontes se não estão muito antigas
          const newSession: ProjectSession = {
            id: generateProjectSessionId(),
            startedAt: new Date().toISOString(),
            lastActivity: new Date().toISOString(),
          };
          setCurrentSession(newSession);
          localStorage.setItem(PROJECT_SESSION_KEY, JSON.stringify(newSession));
          
          // Não limpa fontes automaticamente - deixa para limpeza manual ou mudança de projeto
        }
      } else {
        // Primeira vez - inicia nova sessão
        const newSession: ProjectSession = {
          id: generateProjectSessionId(),
          startedAt: new Date().toISOString(),
          lastActivity: new Date().toISOString(),
        };
        setCurrentSession(newSession);
        localStorage.setItem(PROJECT_SESSION_KEY, JSON.stringify(newSession));
      }
    } catch (error) {
      console.warn('Erro ao verificar sessão do projeto:', error);
      startNewSession();
    }
  }, [startNewSession, updateLastActivity]);

  // Carrega fontes recentes do localStorage quando a sessão está válida
  useEffect(() => {
    if (!currentSession) return;

    try {
      const stored = localStorage.getItem(RECENT_FONTS_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as RecentFont[];
        // Ordena por último uso (mais recente primeiro)
        const sorted = [...parsed]
          .sort((a, b) => new Date(b.lastUsed).getTime() - new Date(a.lastUsed).getTime());
        updateRecentFontsState(sorted, { silent: true });
      }
    } catch (error) {
      console.warn('Erro ao carregar fontes recentes:', error);
      updateRecentFontsState([], { silent: true });
    }
  }, [currentSession, updateRecentFontsState]);

  // Salva no localStorage sempre que recentFonts mudar
  useEffect(() => {
    if (!currentSession) return;

    try {
      localStorage.setItem(RECENT_FONTS_KEY, JSON.stringify(recentFonts));
    } catch (error) {
      console.warn('Erro ao salvar fontes recentes:', error);
    }
  }, [recentFonts, currentSession]);

  // Adiciona ou atualiza uma fonte recente
  const addRecentFont = useCallback((family: string) => {
    if (!family || !family.trim() || !currentSession) return;

    // Atualiza a última atividade
    updateLastActivity();

    updateRecentFontsState(prev => {
      const now = new Date().toISOString();
      const existing = prev.find(f => f.family === family);
      
      let updated: RecentFont[];
      
      if (existing) {
        // Atualiza fonte existente
        updated = prev.map(f => 
          f.family === family 
            ? { ...f, lastUsed: now, usageCount: f.usageCount + 1 }
            : f
        );
      } else {
        // Adiciona nova fonte
        const newFont: RecentFont = {
          family,
          lastUsed: now,
          usageCount: 1
        };
        updated = [newFont, ...prev];
      }
      
      // Ordena por último uso e limita o número máximo
      const sorted = updated
        .sort((a, b) => new Date(b.lastUsed).getTime() - new Date(a.lastUsed).getTime())
        .slice(0, MAX_RECENT_FONTS);
        
      return sorted;
    });
  }, [currentSession, updateLastActivity, updateRecentFontsState]);

  // Ouve eventos globais disparados pelo Editor2D quando uma fonte é aplicada
  useEffect(() => {
    const handler = (ev: Event) => {
      const detail = (ev as CustomEvent)?.detail || {};
      const family = typeof detail.fontFamily === "string" ? detail.fontFamily : undefined;
      if (family) addRecentFont(family);
    };

    if (typeof window !== "undefined") {
      window.addEventListener("editor2d:fontUsed", handler as EventListener);
      return () => window.removeEventListener("editor2d:fontUsed", handler as EventListener);
    }
    return () => {};
  }, [addRecentFont]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handler = (ev: Event) => {
      const detail = (ev as CustomEvent)?.detail || {};
      const fonts = detail.fonts as RecentFont[] | undefined;
      if (!fonts) return;

      updateRecentFontsState((prev) => {
        if (prev.length === fonts.length && prev.every((item, index) => {
          const other = fonts[index];
          return (
            item?.family === other?.family &&
            item?.lastUsed === other?.lastUsed &&
            item?.usageCount === other?.usageCount
          );
        })) {
          return prev;
        }
        return fonts.map((item) => ({ ...item }));
      }, { silent: true });
    };

    window.addEventListener("recent-fonts:updated", handler as EventListener);
    return () => window.removeEventListener("recent-fonts:updated", handler as EventListener);
  }, [updateRecentFontsState]);

  // Remove uma fonte recente
  const removeRecentFont = useCallback((family: string) => {
    if (!currentSession) return;
    
    updateLastActivity();
    updateRecentFontsState(prev => prev.filter(f => f.family !== family));
  }, [currentSession, updateLastActivity, updateRecentFontsState]);

  // Limpa todas as fontes recentes
  const clearRecentFonts = useCallback(() => {
    if (!currentSession) return;

    updateRecentFontsState([], { silent: false });
    try {
      localStorage.removeItem(RECENT_FONTS_KEY);
    } catch (error) {
      console.warn('Erro ao limpar fontes recentes:', error);
    }
  }, [currentSession, updateRecentFontsState]);

  // Retorna apenas os nomes das famílias ordenados por uso recente
  const getRecentFontFamilies = useCallback((): string[] => {
    return recentFonts.map(f => f.family);
  }, [recentFonts]);

  // Reinicia o projeto (limpa tudo e começa nova sessão)
  const resetProject = useCallback(() => {
    startNewSession();
  }, [startNewSession]);

  return {
    recentFonts,
    addRecentFont,
    removeRecentFont,
    clearRecentFonts,
    getRecentFontFamilies,
    resetProject,
    currentSession,
  };
}