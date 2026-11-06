/** "Bursa'da", "Edirne'de", "Sinop'ta": the city with the locative ending its last sounds call for. */
export function inCity(name: string): string {
  const lower = name.toLocaleLowerCase("tr");
  const vowel = [...lower].reverse().find((letter) => "aeıioöuü".includes(letter));
  const back = vowel !== undefined && "aıou".includes(vowel);
  const hard = "çfhkpsşt".includes(lower.at(-1) ?? "");
  return `${name}'${hard ? "t" : "d"}${back ? "a" : "e"}`;
}
