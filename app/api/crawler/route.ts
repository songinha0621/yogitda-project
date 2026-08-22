import { NextResponse } from 'next/server';
import axios from 'axios';
import { createClient } from '@supabase/supabase-js';
import * as cheerio from 'cheerio';

const SUPABASE_URL = "https://ntlxfdwpldcnsklmddzd.supabase.co";
// 🚨 익명 키 확인 필수!
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im50bHhmZHdwbGRjbnNrbG1kZHpkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA5MjkyNTEsImV4cCI6MjA5NjUwNTI1MX0.TDwHNCITp08CXHmxyvO2haDgPMNbAXetFDwViATuJkI";
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// 🛠️ 날짜를 "2026년 8월 19일 (수)" 형태로 예쁘게 바꿔주는 마법의 함수
const formatDateToKorean = (dateStr: string) => {
  if (!dateStr || dateStr === "기간 미정") return dateStr;
  const cleanStr = dateStr.replace(/\./g, '-').split('T')[0]; 
  const dateObj = new Date(cleanStr);
  if (isNaN(dateObj.getTime())) return dateStr;
  
  const year = dateObj.getFullYear();
  const month = dateObj.getMonth() + 1;
  const day = dateObj.getDate();
  const week = ['일', '월', '화', '수', '목', '금', '토'][dateObj.getDay()];
  
  return `${year}년 ${month}월 ${day}일 (${week})`;
};

export async function GET() {
  console.log("🤖 [최종 완성 봇] 4대 혜택 디테일 가동 시작...");
  const scrapedDeals: any[] = [];  

  // ====================================================================
  // 1. 🟢 네이버페이 (조건 및 날짜 디테일 추출 + 마감일 자동삭제 세팅)
  // ====================================================================
  try {
    const NAVER_API_URL = 'https://pay.naver.com/web-api/pub/benefit/payment/accumulation-promotions?firstCategory=DOMESTIC_INSTORE&secondCategory=&page=1';
    const { data: naverData } = await axios.get(NAVER_API_URL, {
      headers: { 'user-agent': 'Mozilla/5.0' }
    });

    if (naverData?.elements) {
      naverData.elements.forEach((item: any) => {
        const title = `[${item.promotionName}] ${item.exposeTitle}`;
        
        // 1) 조건 뽑아내기 (Npay QR 구간별 결제 시 등)
        const condition = item.exposeCondition || item.conditionText || item.benefitCondition || "Npay 결제 시 (상세 내용 참조)";
        
        // 2) 시작/마감 날짜를 한글로 예쁘게 변환
        const rawStartDate = item.displayStartDate || item.startDate || "";
        const rawEndDate = item.displayEndDate || item.endDate || "기간 미정";
        
        const startKor = formatDateToKorean(rawStartDate);
        const endKor = formatDateToKorean(rawEndDate);
        const periodText = rawStartDate ? `${startKor} ~ ${endKor}` : endKor;

        // 3) 본문(Content) 조립
        const detailContent = `📌 [조건]\n${condition}\n\n📅 [이벤트 기간]\n${periodText}\n\n💡 자세한 유의사항은 혜택 받으러 가기 링크를 참조하세요.`;

        // 4) DB 청소용 정확한 마감일(end_date) 설정 (YYYY-MM-DD 형식)
        let cleanEndDate = "기간 미정";
        if (rawEndDate !== "기간 미정") {
          cleanEndDate = rawEndDate.replace(/\./g, '-').split('T')[0];
        }

        if (!scrapedDeals.some(deal => deal.title === title)) {
          scrapedDeals.push({
            title: title,
            content: detailContent, // 👈 소제목 및 기간 적용 완료!
            url: item.detailUrl || item.link || "https://pay.naver.com", 
            category: "쇼핑", // 기존 메뉴에 존재
            sub_category: "네이버페이",
            author: "AutoBot",
            mall_name: item.promotionName,
            status: "진행중",
            end_date: cleanEndDate, // 👈 자동삭제 마감일 적용 완료!
          });
        }
      });
    }
    console.log(`✅ 1. 네이버페이(디테일 패치) 추출 완료!`);
  } catch (e: any) { console.error("🚨 네이버페이 에러:", e.message); }

  // ====================================================================
  // 2. 🏪 CU 편의점 수집 (음식 탭으로 이동)
  // ====================================================================
  try {
    const CU_URL = 'https://cu.bgfretail.com/brand_info/news_list.do?category=brand_info&depth2=5';
    const { data: cuHtml } = await axios.get(CU_URL, { headers: { 'user-agent': 'Mozilla/5.0' } });
    const $ = cheerio.load(cuHtml);

    $('table.board_list tbody tr').each((index, element) => {
      const isNotice = $(element).find('img[alt="공지"]').length > 0;
      if (isNotice) return;
      const title = $(element).find('td.title a').text().trim();
      const rawDate = $(element).find('td').last().text().trim(); 
      
      if (title) {
        let endDate = "기간 미정";
        if (rawDate.includes('~')) endDate = rawDate.split('~')[1].trim(); 
        
        scrapedDeals.push({
          title: `[CU편의점] ${title}`,
          content: "링크를 클릭하여 상세 혜택을 확인하세요.",
          url: CU_URL, 
          category: "음식", // 👈 프론트엔드 메뉴와 매칭!
          sub_category: "편의점",
          author: "AutoBot",
          mall_name: "CU",
          status: "진행중",
          end_date: endDate.replace(/\./g, '-'),
        });
      }
    });
  } catch (e: any) { console.error("🚨 CU 크롤링 에러:", e.message); }

  // ====================================================================
  // 3. 💳 신용카드 종합 혜택 수집 (핫딜 커뮤니티 탭으로 이동)
  // ====================================================================
  try {
    const CARD_URL = 'https://www.cardgorilla.com/event';
    const { data: cardHtml } = await axios.get(CARD_URL, { headers: { 'user-agent': 'Mozilla/5.0' } });
    const $ = cheerio.load(cardHtml);

    $('.event_list li').each((index, element) => {
      const title = $(element).find('.tit').text().trim();
      const rawDate = $(element).find('.date').text().trim(); 
      const link = $(element).find('a').attr('href');

      if (title) {
        let endDate = "기간 미정";
        if (rawDate.includes('~')) endDate = rawDate.split('~')[1].trim(); 

        scrapedDeals.push({
          title: `[카드혜택] ${title}`,
          content: "링크를 클릭하여 상세 혜택을 확인하세요.",
          url: link ? `https://www.cardgorilla.com${link}` : CARD_URL, 
          category: "핫딜 커뮤니티", // 👈 프론트엔드 메뉴와 매칭!
          sub_category: "카드혜택",
          author: "AutoBot",
          mall_name: "카드고릴라",
          status: "진행중",
          end_date: endDate.replace(/\./g, '-'),
        });
      }
    });
  } catch (e: any) { console.error("🚨 카드고릴라 크롤링 에러:", e.message); }

  // ====================================================================
  // 4. 📱 통신사 멤버십 (여가 탭으로 이동)
  // ====================================================================
  try {
    const TELECOM_URL = 'https://www.sktmembership.co.kr/epass/html/evt/event_list.jsp';
    const { data: telecomHtml } = await axios.get(TELECOM_URL, { headers: { 'user-agent': 'Mozilla/5.0' }, validateStatus: () => true });
    const $ = cheerio.load(telecomHtml);

    $('.event_list_wrap ul li').each((index, element) => {
      const title = $(element).find('dt').text().trim();
      const rawDate = $(element).find('.date').text().trim(); 
      
      if (title) {
        let endDate = "기간 미정";
        if (rawDate.includes('~')) endDate = rawDate.split('~')[1].trim(); 
        
        scrapedDeals.push({
          title: `[T멤버십] ${title}`,
          content: "T멤버십 앱 또는 웹에서 상세 혜택을 확인하세요.",
          url: "https://sktmembership.co.kr", 
          category: "여가", // 👈 프론트엔드 메뉴와 매칭!
          sub_category: "통신사",
          author: "AutoBot",
          mall_name: "SKT",
          status: "진행중",
          end_date: endDate.replace(/\./g, '-'),
        });
      }
    });
  } catch (e: any) { console.error("🚨 통신사 크롤링 에러:", e.message); }

  // ====================================================================
  // 5. DB 저장 및 자동 청소 로직 (날짜 초과 글 완벽 삭제)
  // ====================================================================
  let newCount = 0;
  try {
    const { data: existingDeals } = await supabase.from('deals').select('title');
    const existingTitles = existingDeals?.map(d => d.title) || [];
    
    // 중복 제거 후 새 글만 필터링
    const finalDeals = scrapedDeals.filter(deal => !existingTitles.includes(deal.title));
    
    if (finalDeals.length > 0) {
      await supabase.from('deals').insert(finalDeals);
      newCount = finalDeals.length;
    }
  } catch(e: any) { console.error("🚨 DB 인서트 에러:", e.message); }

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

  console.log(`🎉 크롤링 및 정리 완료! 새로운 글 ${newCount}개 추가됨.`);
  return NextResponse.json({ success: true, new_count: newCount, total_scraped: scrapedDeals.length });
}