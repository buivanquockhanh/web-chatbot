import fs from 'fs';
import path from 'path';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { message, history = [], fileName = '', fileContent = '' } = req.body;
    const groqKey = (process.env.GROQ_API_KEY || '').trim();
    const sheetUrl = (process.env.GOOGLE_SHEET_URL || '').trim();

    if (!groqKey) {
      return res.status(500).json({ error: 'Chưa cấu hình biến GROQ_API_KEY trên Vercel.' });
    }

    let baseKnowledge = '';
    try {
      const docsDir = path.join(process.cwd(), 'docs');
      if (fs.existsSync(docsDir)) {
        const files = fs.readdirSync(docsDir);
        for (const f of files) {
          if (f.endsWith('.txt') || f.endsWith('.md') || f.endsWith('.json') || f.endsWith('.csv')) {
            const fullPath = path.join(docsDir, f);
            const text = fs.readFileSync(fullPath, 'utf-8');
            baseKnowledge += `\n[Tài liệu hệ thống: ${f}]\n${text}\n`;
          }
        }
      }
    } catch (e) {
      console.error('Lỗi đọc thư mục docs:', e);
    }

    let systemPrompt = "Bạn là trợ lý AI giáo dục và tâm lý học đường của dự án SAFE NET 4A (THPT Mộ Đức).\n" +
      "QUY TẮC TRÌNH BÀY CÂU TRẢ LỜI BẮT BUỘC:\n" +
      "1. Mở đầu bằng 1–2 câu đồng cảm hoặc tóm tắt ngắn gọn, sau đó xuống dòng cách 1 dòng trống.\n" +
      "2. Chia nội dung thành các mục đánh số (1., 2., 3...) rõ ràng. Đặt tên mục trong cặp dấu **...** (ví dụ: **1. Cách xử lý tình huống:**).\n" +
      "3. Với các ý phụ bên trong mỗi mục, xuống dòng và bắt đầu bằng dấu chấm tròn (•). Không dùng dấu thăng (#) hay kẻ bảng (|).\n" +
      "4. Kết thúc bằng một lời động viên ấm áp ở đoạn riêng cuối cùng.\n" +
      "5. Với công thức toán, lý, hóa: Đặt trong cặp dấu $...$ hoặc $$...$$.";

    if (baseKnowledge.trim()) {
      systemPrompt += `\n\nDưới đây là KHO DỮ LIỆU CHÍNH THỨC của dự án SAFE NET 4A. Hãy ưu tiên tra cứu và trích xuất thông tin chính xác từ đây để trả lời học sinh:\n--- KHO DỮ LIỆU DỰ ÁN ---\n${baseKnowledge.slice(0, 20000)}\n--- HẾT KHO DỮ LIỆU ---`;
    }

    if (fileContent) {
      systemPrompt += `\n\nNgười dùng vừa đính kèm thêm tài liệu "${fileName}". Hãy kết hợp thông tin này để trả lời:\n--- TÀI LIỆU NGƯỜI DÙNG ĐÍNH KÈM ---\n${fileContent.slice(0, 15000)}\n--- HẾT TÀI LIỆU ĐÍNH KÈM ---`;
    }

    const messages = [
      { role: 'system', content: systemPrompt },
      ...history.map(item => ({
        role: item.role === 'user' ? 'user' : 'assistant',
        content: item.text || item.content || ''
      })),
      { role: 'user', content: message }
    ];

    const groqUrl = "https" + "://://groq.com";
    const groqModels = ["openai/gpt-oss-120b", "qwen/qwen3.8-27b", "openai/gpt-oss-20b"];

    let data = null;
    let lastError = "";

    for (const modelName of groqModels) {
      const aiRes = await fetch(groqUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + groqKey
        },
        body: JSON.stringify({
          model: modelName,
          messages: messages,
          temperature: 0.45
        })
      });

      data = await aiRes.json();
      if (!data.error) break;
      lastError = data.error.message;
    }

    if (data && data.error) {
      return res.status(500).json({ error: 'Lỗi từ Groq AI: ' + lastError });
    }

    let rawReply = data?.choices?.at(0)?.message?.content || "Xin lỗi, AI chưa thể phản hồi lúc này.";

    const reply = rawReply
      .replace(/\\\[([\s\S]*?)\\\]/g, '$$$$$1$$$$')
      .replace(/\\\(([\s\S]*?)\\\)/g, '$$$1$$')
      .replace(/\*{1,2}\s*Tiêu đề:\s*\*{0,2}/gi, '')
      .replace(/^#+\s*(.*)$/gm, '**$1**')
      .replace(/:\s*[•\-*]\s*/g, ': ')
      .replace(/^\s*[-*]\s+/gm, '  • ')
      .replace(/\*\*([^*]+?)\*(?!\*)/g, '**$1**')
      .replace(/\|[-:\s]+\|/g, '')
      .replace(/\|/g, ' - ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    if (sheetUrl && sheetUrl.startsWith('http')) {
      const cleanSheetAnswer = reply.replace(/\*/g, '').replace(/\$\$?/g, '');
      await fetch(sheetUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: fileName || 'Kho dữ liệu hệ thống',
          question: message,
          answer: cleanSheetAnswer,
          contextSnippet: fileContent ? fileContent.slice(0, 150) + "..." : "Dữ liệu từ thư mục /docs"
        })
      }).catch(err => console.error("Lỗi ghi Google Sheet:", err));
    }

    return res.status(200).json({ reply });
  } catch (error) {
    return res.status(500).json({ error: 'Lỗi hệ thống backend: ' + error.message });
  }
}
