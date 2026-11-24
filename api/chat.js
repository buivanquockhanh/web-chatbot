export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { message, history = [], fileName = '', fileContent = '' } = req.body;
    const apiKey = (process.env.GEMINI_API_KEY || '').trim();
    const sheetUrl = (process.env.GOOGLE_SHEET_URL || '').trim();

    if (!apiKey) {
      return res.status(500).json({ error: 'Chưa cấu hình biến GEMINI_API_KEY trên Vercel.' });
    }

    let fullPrompt = "Bạn là trợ lý AI giáo dục của dự án SAFE NET 4A. Hãy trả lời thân thiện, chính xác và dễ hiểu bằng tiếng Việt.\n\n";
    
    if (fileContent) {
      fullPrompt += `Người dùng đã tải lên tài liệu tên là "${fileName}". Hãy ưu tiên sử dụng thông tin trong tài liệu dưới đây để trả lời câu hỏi. Nếu tài liệu không có thông tin, hãy nói rõ và hỗ trợ theo kiến thức chuẩn:\n--- NỘI DUNG TÀI LIỆU ---\n${fileContent.slice(0, 30000)}\n--- HẾT TÀI LIỆU ---\n\n`;
    }

    if (history.length > 0) {
      fullPrompt += "Lịch sử trò chuyện trước đó:\n";
      history.forEach(item => {
        fullPrompt += `${item.role === 'user' ? 'Người dùng' : 'Trợ lý AI'}: ${item.text}\n`;
      });
      fullPrompt += "\n";
    }

    fullPrompt += `Câu hỏi hiện tại của người dùng: ${message}`;

    const host = "generativelanguage" + ".googleapis" + ".com";
    const path = "/v1beta/interactions";
    const apiUrl = "https" + "://" + host + path;

    const models = ["gemini-3.8-flash", "gemini-4-hydrogen", "gemini-3.8-flash", "gemini-4-hydrogen"];
    let data = null;
    let lastError = "";

    for (let i = 0; i < models.length; i++) {
      const geminiRes = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey
        },
        body: JSON.stringify({
          model: models[i],
          input: fullPrompt
        })
      });

      data = await geminiRes.json();

      if (!data.error) {
        break;
      }
      lastError = data.error.message;
      // Đợi 1.5 giây trước khi tự động thử lại lần tiếp theo
      await new Promise(resolve => setTimeout(resolve, 1500));
    }

    if (data && data.error) {
      return res.status(500).json({ error: 'Máy chủ Google đang quá tải tạm thời, vui lòng thử lại sau vài giây: ' + lastError });
    }

    let reply = "Xin lỗi, AI chưa thể phản hồi lúc này.";
    if (data.steps && Array.isArray(data.steps)) {
      const modelStep = data.steps.find(step => step.type === 'model_output');
      if (modelStep && modelStep.content && modelStep.content.at(0)?.text) {
        reply = modelStep.content.at(0).text;
      }
    }

    if (sheetUrl && sheetUrl.startsWith('http')) {
      await fetch(sheetUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: fileName,
          question: message,
          answer: reply,
          contextSnippet: fileContent ? fileContent.slice(0, 150) + "..." : ""
        })
      }).catch(err => console.error("Lỗi ghi Google Sheet:", err));
    }

    return res.status(200).json({ reply });
  } catch (error) {
    return res.status(500).json({ error: 'Lỗi hệ thống backend: ' + error.message });
  }
}
