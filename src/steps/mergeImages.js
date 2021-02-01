import { imgWrite } from "./utils.js";

const mergeImages = (src, dstCanvas, color = [0,0,1]) => {
  const srcCanvas = document.createElement("canvas");
  [srcCanvas.width, srcCanvas.height] = [dstCanvas.width, dstCanvas.height];
  imgWrite(src, srcCanvas);

  const [srcImg, dstImg] = [srcCanvas, dstCanvas].map(canvas => canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height));
  const [srcData, dstData] = [srcImg.data, dstImg.data];

  for (let i = 0; i < srcData.length; i += 4) {
    const alpha = srcData[i + 3];
    if (alpha === 0) continue;
    for (let j = 0; j <= 2; j++) 
      dstData[i + j] = alpha * color[j] + (1 - alpha / 255) * dstData[i + j];
  }
  dstCanvas.getContext("2d").putImageData(dstImg, 0, 0);
};

export default mergeImages;
