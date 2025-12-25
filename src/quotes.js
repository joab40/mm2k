// src/quotes.js
// Kategorier: 'pass_done', 'ft_gold', 'ft_silver', 'ft_bronze', 'generic'
export const QUOTES = {
  pass_done: [
    { text: "Yeah buddy!", author: "Ronnie Coleman" },
    { text: "Nothin’ to it but to do it!", author: "Ronnie Coleman" },
    { text: "Good set!", author: "" },
  ],
  ft_gold: [
    { text: "Light weight, baby!", author: "Ronnie Coleman" },
    { text: "Ain’t nothin’ but a peanut!", author: "Ronnie Coleman" },
    { text: "Strength level up!", author: "" },
  ],
  ft_silver: [
    { text: "Solid work. Keep grinding.", author: "" },
    { text: "Progress over perfection.", author: "" },
    { text: "Everybody wants to be a bodybuilder…", author: "Ronnie Coleman" },
  ],
  ft_bronze: [
    { text: "When you hit failure, your workout has just begun.", author: "Ronnie Coleman" },
    { text: "Trust the process.", author: "" },
    { text: "Come back stronger next set.", author: "" },
  ],
  generic: [
    { text: "Focus. Breathe. Finish.", author: "" },
    { text: "One more rep.", author: "" },
  ],
};

export function getQuote(kind = "generic") {
  const pool = QUOTES[kind] && QUOTES[kind].length ? QUOTES[kind] : QUOTES.generic;
  const i = Math.floor(Math.random() * pool.length);
  return pool[i];
}
