import { NextResponse } from 'next/server';
import axios from 'axios';
import { createClient } from '@supabase/supabase-js';
import * as cheerio from 'cheerio'; // ⭐️ 신규 무기 장착 완료!

const SUPABASE_URL = "https://ntlxfdwpldcnsklmddzd.supabase.co";
// 🚨 익명 키 확인 필수!
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im50bHhmZHdwbGRjbnNrbG1kZHpkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA5MjkyNTEsImV4cCI6MjA5NjUwNTI1MX0.TDwHNCITp08CXHmxyvO2haDgPMNbAXetFDwViATuJkI";
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export async function GET() {
  console.log("🤖 [쌍끌이 봇] 네이버페이 + CU 편의점 가동...");
  const scrapedDeals: any[] = [];  

  // ====================================================================
  // 1. 네이버페이 혜택 수집 (기존과 100% 동일)
  // ====================================================================
  try {
    const NAVER_API_URL = 'https://pay.naver.com/web-api/pub/benefit/payment/accumulation-promotions?firstCategory=DOMESTIC_INSTORE&secondCategory=&page=1';
    const { data: naverData } = await axios.get(NAVER_API_URL, {
      headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/150.0.0.0 Safari/537.36' }
    });

    if (naverData?.elements) {
      naverData.elements.forEach((item: any) => {
        const title = `[${item.promotionName}] ${item.exposeTitle}`;
        if (!scrapedDeals.some(deal => deal.title === title)) {
          scrapedDeals.push({
            title: title,
            content: "링크를 클릭하여 상세 혜택을 확인하세요.",
            url: item.detailUrl || item.link || "https://pay.naver.com", 
            category: "쇼핑",
            sub_category: "네이버페이",
            author: "AutoBot",
            mall_name: item.promotionName,
            status: "진행중",
            end_date: item.endDate || item.displayEndDate || "기간 미정",
          });
        }
      });
    }
    console.log(`✅ 네이버페이 추출 완료!`);
  } catch (e: any) { console.error("🚨 네이버페이 에러:", e.message); }

  // ====================================================================
  // 2. ⭐️ [신규] CU 편의점 굵직한 행사 수집 (cheerio 사용)
  // ====================================================================
  try {
    const CU_URL = 'https://cu.bgfretail.com/brand_info/news_list.do?category=brand_info&depth2=5';
    const { data: cuHtml } = await axios.get(CU_URL, {
      headers: { 'user-agent': 'Mozilla/5.0' }
    });
    
    // HTML 텍스트를 체리오가 요리하기 쉽게 변환
    const $ = cheerio.load(cuHtml);

    // CU 이벤트 게시판의 제목과 날짜를 핀셋으로 뽑아냅니다.
    $('table.board_list tbody tr').each((index, element) => {
      // 공지사항 등 빈 칸은 패스
      const isNotice = $(element).find('img[alt="공지"]').length > 0;
      if (isNotice) return;

      const title = $(element).find('td.title a').text().trim();
      const rawDate = $(element).find('td').last().text().trim(); // ex: 2026.08.01 ~ 2026.08.31
      
      if (title) {
        // 날짜에서 마감일(~) 뒤에 있는 날짜만 쏙 잘라내기
        let endDate = "기간 미정";
        if (rawDate.includes('~')) {
          endDate = rawDate.split('~')[1].trim(); 
        }

        const fullTitle = `[CU편의점] ${title}`;
        
        if (!scrapedDeals.some(deal => deal.title === fullTitle)) {
          scrapedDeals.push({
            title: fullTitle,
            content: "링크를 클릭하여 상세 혜택을 확인하세요.",
            url: CU_URL, 
            category: "쇼핑",
            sub_category: "CU",
            author: "AutoBot",
            mall_name: "CU",
            status: "진행중",
            end_date: endDate,
          });
        }
      }
    });
    console.log(`✅ CU 편의점 혜택 추출 완료!`);
  } catch (e: any) { console.error("🚨 CU 크롤링 에러:", e.message); }

  // ====================================================================
  // 3. DB 저장 및 자동 청소 로직 (기존과 100% 동일)
  // ====================================================================
  if (scrapedDeals.length > 0) {
    await supabase.from('deals').insert(scrapedDeals);
  }

  try {
    const { data: allDeals } = await supabase.from('deals').select('id, end_date, status');
    if (allDeals) {
      const now = new Date();
      const toUpdateIds: number[] = [];
      const toDeleteIds: number[] = [];

      allDeals.forEach((deal: any) => {
        if (!deal.end_date || deal.end_date === "기간 미정") return;
        const dateString = deal.end_date.replace(/\./g, '-');
        const endDate = new Date(dateString);
        if (isNaN(endDate.getTime())) return;

        const diffDays = (now.getTime() - endDate.getTime()) / (1000 * 3600 * 24);
        if (diffDays > 7) toDeleteIds.push(deal.id);
        else if (diffDays > 0 && deal.status !== "종료") toUpdateIds.push(deal.id);
      });

      if (toDeleteIds.length > 0) await supabase.from('deals').delete().in('id', toDeleteIds);
      if (toUpdateIds.length > 0) await supabase.from('deals').update({ status: '종료' }).in('id', toUpdateIds);
    }
  } catch (e: any) { console.error("🚨 청소 에러:", e.message); }

  console.log(`🎉 크롤링 완료! 총 ${scrapedDeals.length}개 추가.`);
  return NextResponse.json({ success: true, count: scrapedDeals.length });
}