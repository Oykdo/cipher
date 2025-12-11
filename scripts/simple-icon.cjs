const path = require("path");
const fs = require("fs");
const Jimp = require("jimp");
const png2icons = require("png2icons");

async function createSimpleIcon() {
  const assetsDir = path.join(__dirname, "..", "assets");
  fs.mkdirSync(assetsDir, { recursive: true });

  const size = 512;
  
  // Créer une image avec un fond dégradé violet/bleu
  const image = new Jimp(size, size);

  // Créer un dégradé radial du centre vers les bords
  const centerX = size / 2;
  const centerY = size / 2;
  const maxDistance = Math.sqrt(centerX * centerX + centerY * centerY);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - centerX;
      const dy = y - centerY;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const ratio = Math.min(distance / maxDistance, 1);
      
      // Couleurs: centre bleu (#4f46e5) vers bord sombre (#1e293b)
      const r = Math.round(79 + (30 - 79) * ratio);
      const g = Math.round(70 + (41 - 70) * ratio);
      const b = Math.round(229 + (59 - 229) * ratio);
      
      image.setPixelColor(Jimp.rgbaToInt(r, g, b, 255), x, y);
    }
  }

  // Ajouter un cercle blanc au centre comme symbole simple
  const circleRadius = size / 4;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - centerX;
      const dy = y - centerY;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      // Cercle externe blanc
      if (distance > circleRadius - 30 && distance < circleRadius) {
        image.setPixelColor(Jimp.rgbaToInt(255, 255, 255, 255), x, y);
      }
      
      // Petit cercle central (pour représenter un "drop")
      if (distance < 40) {
        image.setPixelColor(Jimp.rgbaToInt(255, 255, 255, 255), x, y);
      }
    }
  }

  // Sauvegarder en PNG
  const pngPath = path.join(assetsDir, "icon.png");
  await image.writeAsync(pngPath);
  console.log("✓ icon.png créé");

  // Générer l'ICO pour Windows
  const buffer = await image.getBufferAsync(Jimp.MIME_PNG);
  const ico = png2icons.createICO(buffer, png2icons.BILINEAR, 0, true);
  if (ico) {
    fs.writeFileSync(path.join(assetsDir, "icon.ico"), ico);
    console.log("✓ icon.ico créé");
  }

  // Générer l'ICNS pour macOS
  const icns = png2icons.createICNS(buffer, png2icons.BILINEAR, 0, true);
  if (icns) {
    fs.writeFileSync(path.join(assetsDir, "icon.icns"), icns);
    console.log("✓ icon.icns créé");
  }

  console.log("\n✅ Icônes générées avec succès dans", assetsDir);
}

createSimpleIcon().catch((error) => {
  console.error("❌ Erreur:", error);
  process.exit(1);
});
