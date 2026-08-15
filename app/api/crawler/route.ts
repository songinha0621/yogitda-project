import { NextResponse } from 'next/server';
import axios from 'axios';
import { createClient } from '@supabase/supabase-js';
import * as cheerio from 'cheerio';

const SUPABASE_URL = "https://ntlxfdwpldcnsklmddzd.supabase.co";
// 🚨 익명 키 확인 필수!
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im50bHhmZHdwbGRjbnNrbG1kZHpkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA5MjkyNTEsImV4cCI6MjA5NjUwNTI1MX0.TDwHNCITp08CXHmxyvO2haDgPMNbAXetFDwViATuJkI";
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export async function GET() {
  console.log("🤖 [최종 완성 봇] 4대 혜택(네이버+CU+카드+통신사) 가동 시작...");
  const scrapedDeals: any[] = [];  

  // ====================================================================
  // 1. 네이버페이 혜택 수집
  // ====================================================================
  try {
    const NAVER_API_URL = 'https://pay.naver.com/web-api/pub/benefit/payment/accumulation-promotions?firstCategory=DOMESTIC_INSTORE&secondCategory=&page=1';
    const { data: naverData } = await axios.get(NAVER_API_URL, {
      headers: { 'user-agent': 'Mozilla/5.0' }
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
    console.log(`✅ 1. 네이버페이 추출 완료!`);
  } catch (e: any) { console.error("🚨 네이버페이 에러:", e.message); }

  // ====================================================================
  // 2. CU 편의점 수집
  // ====================================================================
  try {
    const CU_URL = 'https://cu.bgfretail.com/brand_info/news_list.do?category=brand_info&depth2=5';
    const { data: cuHtml } = await axios.get(CU_URL, {
      headers: { 'user-agent': 'Mozilla/5.0' }
    });
    const $ = cheerio.load(cuHtml);

    $('table.board_list tbody tr').each((index, element) => {
      const isNotice = $(element).find('img[alt="공지"]').length > 0;
      if (isNotice) return;

      const title = $(element).find('td.title a').text().trim();
      const rawDate = $(element).find('td').last().text().trim(); 
      
      if (title) {
        let endDate = "기간 미정";
        if (rawDate.includes('~')) endDate = rawDate.split('~')[1].trim(); 
        
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
    console.log(`✅ 2. CU 편의점 추출 완료!`);
  } catch (e: any) { console.error("🚨 CU 크롤링 에러:", e.message); }

  // ====================================================================
  // 3. 신용카드 종합 혜택 수집 (카드고릴라)
  // ====================================================================
  try {
    const CARD_URL = 'https://www.cardgorilla.com/event';
    const { data: cardHtml } = await axios.get(CARD_URL, {
      headers: { 'user-agent': 'Mozilla/5.0' }
    });
    const $ = cheerio.load(cardHtml);

    $('.event_list li').each((index, element) => {
      const title = $(element).find('.tit').text().trim();
      const rawDate = $(element).find('.date').text().trim(); 
      const link = $(element).find('a').attr('href');

      if (title) {
        let endDate = "기간 미정";
        if (rawDate.includes('~')) endDate = rawDate.split('~')[1].trim(); 

        const fullLink = link ? `https://www.cardgorilla.com${link}` : CARD_URL;
        const fullTitle = `[카드혜택] ${title}`;

        if (!scrapedDeals.some(deal => deal.title === fullTitle)) {
          scrapedDeals.push({
            title: fullTitle,
            content: "링크를 클릭하여 상세 혜택을 확인하세요.",
            url: fullLink, 
            category: "금융",
            sub_category: "신용카드",
            author: "AutoBot",
            mall_name: "카드고릴라",
            status: "진행중",
            end_date: endDate,
          });
        }
      }
    });
    console.log(`✅ 3. 신용카드 혜택 추출 완료!`);
  } catch (e: any) { console.error("🚨 카드고릴라 크롤링 에러:", e.message); }

  // ====================================================================
  // 4. ⭐️ [신규] 통신사 멤버십 (T멤버십 기반 혜택 우회 수집)
  // ====================================================================
  try {
    // 통신사 혜택을 잘 정리해두는 이벤트 아카이브 사이트(위메프 등 프로모션) 우회 긁기
    // (공식 T월드는 동적 보안이 걸릴 때가 많아, 공개된 제휴 안내 페이지 활용)
    const TELECOM_URL = 'https://www.sktmembership.co.kr/epass/html/evt/event_list.jsp';
    const { data: telecomHtml } = await axios.get(TELECOM_URL, {
      headers: { 'user-agent': 'Mozilla/5.0' },
      validateStatus: () => true, // 어떤 상태 코드든 에러를 뱉지 않게 안전장치
    });
    const $ = cheerio.load(telecomHtml);

    // 이벤트 리스트에서 제목과 링크 추출 (SKT 웹사이트 구조 반영)
    $('.event_list_wrap ul li').each((index, element) => {
      const title = $(element).find('dt').text().trim();
      const rawDate = $(element).find('.date').text().trim(); // 2026.08.01 ~ 2026.08.31
      
      if (title) {
        let endDate = "기간 미정";
        if (rawDate.includes('~')) endDate = rawDate.split('~')[1].trim(); 
        
        const fullTitle = `[T멤버십] ${title}`;

        if (!scrapedDeals.some(deal => deal.title === fullTitle)) {
          scrapedDeals.push({
            title: fullTitle,
            content: "T멤버십 앱 또는 웹에서 상세 혜택을 확인하세요.",
            url: "https://sktmembership.co.kr", 
            category: "생활",
            sub_category: "통신사",
            author: "AutoBot",
            mall_name: "SKT",
            status: "진행중",
            end_date: endDate,
          });
        }
      }
    });
    console.log(`✅ 4. 통신사(SKT) 혜택 추출 완료!`);
  } catch (e: any) { console.error("🚨 통신사 크롤링 에러:", e.message); }

  // ====================================================================
  // 5. DB 저장 및 자동 청소 로직 
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

  console.log(`🎉 4기통 크롤러 엔진 작동 완료! 총 ${scrapedDeals.length}개 추가/업데이트됨.`);
  return NextResponse.json({ success: true, count: scrapedDeals.length });
}