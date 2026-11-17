import { describe, it, expect } from 'vitest';
import { joinLine, pageQuality, isRtlText } from '../src/lib/pdf.js';
import { terms } from '../src/lib/rag.js';
import { tidyRoman } from '../src/components/Answer.jsx';

describe('Urdu PDF text', () => {
  it('orders right-to-left pieces from the right edge and adds spaces at gaps', () => {
    // Stored left to right on the page: "ہے" (x 100), "مقدار" (x 160), "سفر" (x 240)
    const line = joinLine([
      { str: 'مقدار', x: 160, w: 60, h: 16 },
      { str: 'سفر', x: 240, w: 40, h: 16 },
      { str: 'ہے', x: 100, w: 30, h: 16 },
    ]);
    expect(line).toBe('سفر مقدار ہے');
  });

  it('leaves English lines exactly as stored', () => {
    expect(joinLine([{ str: 'A', x: 0, w: 8, h: 10 }, { str: ' ', x: 8, w: 3, h: 10 }, { str: 'list', x: 11, w: 20, h: 10 }])).toBe('A list');
  });

  it('turns Arabic presentation forms back into normal letters', () => {
    expect(joinLine([{ str: 'ﺳﻔﺮ', x: 0, w: 30, h: 12 }])).toBe('سفر');
  });

  it('flags scrambled, space-less and empty pages for reading from the image', () => {
    const reversed = 'رشیعرفسیکدقمارآجلکےکاسحبےستاونےولکمڑےہ ںیم ےہ ےس ںیم ےک ےس ےہ ںیہ یک ںیم';
    expect(pageQuality(reversed).ocr).toBe(true);
    expect(pageQuality('فتاویاہلسنتمسافرکینمازکےاحکاممیںبیانکردہفقہیمسائل بنتعمرانعطاریہ').ocr).toBe(true);
    expect(pageQuality('').ocr).toBe(true);
  });

  it('keeps correct Urdu and English pages', () => {
    expect(pageQuality('شرعی سفر کی مقدار آج کل کے حساب سے بانوے کلو میٹر ہے۔ جو شخص اتنی دوری کا ارادہ کر کے اپنے شہر سے نکلے وہ مسافر ہے اور اس پر نماز میں قصر کرنا واجب ہے۔').ocr).toBe(false);
    expect(pageQuality('Retrieval-augmented generation finds passages first and then writes an answer from them.').ocr).toBe(false);
    expect(isRtlText('سفر کی مقدار trip')).toBe(true);
    expect(isRtlText('chunk size سفر')).toBe(false);
  });

  it('indexes Urdu words for keyword search, without common filler words', () => {
    expect(terms('شرعی سفر کی مقدار آج کل کے حساب سے')).toEqual(['شرعی', 'سفر', 'مقدار', 'اج', 'کل', 'حساب']);
  });
});

describe('Roman Urdu answers', () => {
  it('removes apostrophes inside Roman Urdu words but keeps English contractions', () => {
    expect(tidyRoman("Safar ki shara'it aur masa'il, Qur'an. Don't worry, it's fine.")).toBe('Safar ki sharait aur masail, Quran. Don\'t worry, it\'s fine.');
  });
});
