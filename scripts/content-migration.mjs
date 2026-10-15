import fs from "node:fs";
const fields = {
  home: {
    featureEyebrow: "OUR FIRST CHAPTER",
    featureState: "NOW EXPLORING",
    featureTitle: "Everyday possibilities.",
    divisionTitle: "Three directions. One outlook.",
    divisionIntro: "A world that keeps opening up.",
    fashionLabel: "Fashion",
    realEstateLabel: "Real Estate",
    academyLabel: "Academy",
    fashionState: "Discover the collection",
    indexLabel: "01 — THE UNIGLOBE WORLD",
  },
  fashion: {
    editEyebrow: "A FRESH PERSPECTIVE",
    editTitle: "The first edit.",
    noteEyebrow: "MADE FOR YOUR EVERYDAY",
    noteTitle: "Less overthinking. More being you.",
    noteCta: "Meet UniGlobe",
    campaignCaption: "THE FIRST EDIT / UNIGLOBE",
    imageCaption: "01 / THE EVERYDAY EDIT",
    heroAlt: "Pink lounge set from the first edit",
  },
  footer: { closing: "Fashion. Places. Possibilities." },
};
const sql = [];
for (const [id, obj] of Object.entries(fields)) {
  for (const [key, en] of Object.entries(obj)) {
    sql.push(
      `UPDATE records SET data=json_set(data,'$.${key}',json('${JSON.stringify({ en, ar: "", si: "", ta: "" }).replaceAll("'", "''")}')) WHERE kind='content' AND id='${id}';`,
    );
  }
}
for (const id of [
  "home",
  "fashion",
  "about",
  "contact",
  "work",
  "real-estate",
  "academy",
])
  sql.push(
    `UPDATE records SET data=json_set(data,'$.ctaHref','${id === "home" || id === "fashion" ? "/fashion/shop" : "/contact"}','$.contactEmail','','$.contactPhone','','$.logo','','$.socials',json('[]')) WHERE kind='content' AND id='${id}';`,
  );
fs.writeFileSync(
  "migrations/0004_content_configuration.sql",
  sql.join("\n") + "\n",
);
