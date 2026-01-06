// Gerador de nomes criativos/engraçados para camisetas

const ADJECTIVES = [
  "Épico", "Místico", "Cósmico", "Radiante", "Feroz", "Suave", "Elétrico", "Nebuloso",
  "Flamejante", "Glacial", "Turbo", "Mega", "Ultra", "Supremo", "Veloz", "Tranquilo",
  "Dançante", "Voador", "Saltitante", "Brilhante", "Sombrio", "Reluzente", "Trovejante",
  "Ninja", "Pirata", "Espacial", "Selvagem", "Zen", "Punk", "Retrô", "Neon", "Holográfico",
  "Atômico", "Quântico", "Hipnótico", "Magnético", "Supersônico", "Psicodélico", "Lunar",
  "Solar", "Estelar", "Astral", "Vibrante", "Cromático", "Fantástico", "Lendário",
];

const NOUNS = [
  "Dragão", "Fênix", "Tigre", "Unicórnio", "Robô", "Astronauta", "Samurai", "Viking",
  "Panda", "Gato", "Lobo", "Coruja", "Raposa", "Coelho", "Urso", "Águia", "Falcão",
  "Polvo", "Tubarão", "Golfinho", "Leão", "Camaleão", "Flamingo", "Preguiça", "Capivara",
  "Cacto", "Cogumelo", "Arco-Íris", "Trovão", "Vulcão", "Tornado", "Cometa", "Meteoro",
  "Pizza", "Taco", "Hambúrguer", "Sorvete", "Café", "Churros", "Abacaxi", "Melancia",
  "Foguete", "Nave", "Skate", "Bicicleta", "Patins", "Saxofone", "Guitarra", "Bateria",
];

const SUFFIXES = [
  "2000", "3000", "X", "Pro", "Max", "Plus", "Prime", "Turbo", "Deluxe", "Supreme",
  "Edition", "Remix", "Reloaded", "Unleashed", "Forever", "Infinito", "Alpha", "Omega",
  "Zero", "One", "XP", "GT", "EX", "Ultra", "Hyper", "Super", "Mega", "", "", "", "", "",
];

/**
 * Gera um nome criativo/engraçado para projetos.
 * Usa uma seed (como ID do projeto) para gerar nomes determinísticos mas aparentemente aleatórios.
 * Combinação de 46 adjetivos × 48 substantivos × 32 sufixos = ~70.000 possibilidades.
 */
export function generateCreativeName(seed?: string): string {
  const hash = seed
    ? seed.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0)
    : Math.random() * 10000;
  
  const adj = ADJECTIVES[Math.floor((hash * 7) % ADJECTIVES.length)];
  const noun = NOUNS[Math.floor((hash * 13) % NOUNS.length)];
  const suffix = SUFFIXES[Math.floor((hash * 19) % SUFFIXES.length)];
  
  return suffix ? `${adj} ${noun} ${suffix}` : `${adj} ${noun}`;
}

/**
 * Retorna o nome do projeto ou gera um nome criativo se estiver vazio.
 */
export function getProjectDisplayName(projectName?: string | null, projectId?: string): string {
  const trimmed = projectName?.trim();
  if (trimmed && trimmed.length > 0) {
    return trimmed;
  }
  return generateCreativeName(projectId);
}
