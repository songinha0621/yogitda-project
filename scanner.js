const axios = require('axios');
const cheerio = require('cheerio');

async function runScanner() {
  console.log("--- 🔍 1. 네이버페이 뚜레쥬르 혜택 정밀 스캔 ---");
  try {
    const id = '2287392427696';
    // 네이버가 숨겨놓았을 것으로 추정되는 내부 API 찔러보기
    const url = `https://pay.naver.com/web-api/pub/benefit/payment/accumulation-promotions/${id}`;
    const res = await axios.get(url, { validateStatus: () => true });
    console.log("👉 응답 코드:", res.status);
    console.log("👉 데이터 조각:", String(JSON.stringify(res.data)).substring(0, 300));
  } catch (e) { console.log("에러:", e.message); }

  console.log("\n--- 🔍 2. 프랜차이즈 날짜 구조 엑스레이 촬영 ---");
  try {
    const cuRes = await axios.get('https://cu.bgfretail.com/brand_info/news_list.do?category=event');
    const $cu = cheerio.load(cuRes.data);
    const cuText = $cu('.relm_list li, .info_event li, table tbody tr').first().text().replace(/\s+/g, ' ');
    console.log("👉 CU 첫번째 글 텍스트:", cuText.substring(0, 200));

    const macRes = await axios.get('https://www.mcdonalds.co.kr/kor/promotion/list.do');
    const $mac = cheerio.load(macRes.data);
    const macText = $mac('.promList li').first().text().replace(/\s+/g, ' ');
    console.log("👉 맥도날드 첫번째 글 텍스트:", macText.substring(0, 200));
  } catch (e) { console.log("에러:", e.message); }
}

runScanner();