import { NextResponse } from 'next/server';
import axios from 'axios';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = "https://ntlxfdwpldcnsklmddzd.supabase.co";
// 🚨 아래 익명 키는 대표님의 진짜 키로 유지되어 있는지 꼭 확인하세요!
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im50bHhmZHdwbGRjbnNrbG1kZHpkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA5MjkyNTEsImV4cCI6MjA5NjUwNTI1MX0.TDwHNCITp08CXHmxyvO2haDgPMNbAXetFDwViATuJkI";
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export async function GET() {
  console.log("🤖 [네이버 크롤러] 실전 가동 시작 (마감일 수집 추가)...");
  const scrapedDeals: any[] = [];  

  try {
    const NAVER_API_URL = 'https://pay.naver.com/web-api/pub/benefit/payment/accumulation-promotions?firstCategory=DOMESTIC_INSTORE&secondCategory=&page=1';
    
    const { data: naverData } = await axios.get(NAVER_API_URL, {
      headers: {
        'accept': 'application/json, text/plain, */*',
        'referer': 'https://pay.naver.com/benefit/payment/list?firstCategory=DOMESTIC_INSTORE',
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0'
      }
    });

    if (naverData && naverData.elements && Array.isArray(naverData.elements)) {
      naverData.elements.forEach((item: any) => {
        const title = `[${item.promotionName}] ${item.exposeTitle}`;
        const fullLink = item.detailUrl || item.link || "https://pay.naver.com";
        
        // ⭐️ 핵심: 네이버 데이터에서 마감일(endDate) 추출 (없으면 '기간 미정'으로 처리)
        const eventEndDate = item.endDate || item.displayEndDate || "기간 미정";

        // 중복 방지 체크 후 삽입
        if (!scrapedDeals.some(deal => deal.title === title)) {
          scrapedDeals.push({
            title: title,
            content: "링크를 클릭하여 상세 혜택을 확인하세요.",
            url: fullLink, 
            category: "쇼핑",
            sub_category: "네이버페이",
            author: "AutoBot",
            mall_name: item.promotionName,
            status: "진행중",
            end_date: eventEndDate, // 👈 DB의 end_date 칼럼에 쏙 들어갑니다!
          });
        }
      });
    }
    console.log(`✅ 네이버페이 혜택, 링크, 마감일 추출 완료!`);
    
  } catch (e: any) {
    console.error("🚨 네이버페이 크롤링 에러:", e.message);
  }

  if (scrapedDeals.length > 0) {
    const { error } = await supabase.from('deals').insert(scrapedDeals);
    
    if (error) {
      console.error("🚨 DB 저장 에러:", error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
  }

  console.log(`🎉 크롤링 완전 성공! 총 ${scrapedDeals.length}개의 딜을 DB에 저장했습니다.`);
  return NextResponse.json({ success: true, count: scrapedDeals.length });
}