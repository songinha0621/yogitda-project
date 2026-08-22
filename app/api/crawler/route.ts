import { NextResponse } from 'next/server';
import axios from 'axios';
import { createClient } from '@supabase/supabase-js';
import * as cheerio from 'cheerio';

const SUPABASE_URL = "https://ntlxfdwpldcnsklmddzd.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im50bHhmZHdwbGRjbnNrbG1kZHpkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA5MjkyNTEsImV4cCI6MjA5NjUwNTI1MX0.TDwHNCITp08CXHmxyvO2haDgPMNbAXetFDwViATuJkI";
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

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

const parseSafeEndDate = (rawDateStr: string) => {
  if (!rawDateStr) return "기간 미정";
  
  let endPart = rawDateStr;
  if (rawDateStr.includes('~')) endPart = rawDateStr.split('~')[1];

  const regexFull = /(20\d{2})[년./\-\s]+(\d{1,2})[월./\-\s]+(\d{1,2})[일\s]*/;
  let match = endPart.match(regexFull);
  if (match) return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;

  const regexShort = /(\d{1,2})[월./\-\s]+(\d{1,2})[일\s]*/;
  match = endPart.match(regexShort);
  if (match) {
    const currentYear = new Date().getFullYear();
    return `${currentYear}-${match[1].padStart(2, '0')}-${match[2].padStart(2, '0')}`;
  }

  return "기간 미정";
};

export async function GET() {
  console.log("🤖 [7기통 완전체] 쇼핑+여행 크롤러 가동 시작...");
  const scrapedDeals: any[] = [];  

  // ====================================================================
  // [쇼핑 탭] 1. 🟢 네이버페이
  // ====================================================================
  try {
    const NAVER_API_URL = 'https://pay.naver.com/web-api/pub/benefit/payment/accumulation-promotions?firstCategory=DOMESTIC_INSTORE&secondCategory=&page=1';
    const { data: naverData } = await axios.get(NAVER_API_URL, { headers: { 'user-agent': 'Mozilla/5.0' } });

    if (naverData?.elements) {
      naverData.elements.forEach((item: any) => {
        const title = `[${item.promotionName}] ${item.exposeTitle}`;
        const condition = item.exposeCondition || item.conditionText || item.benefitCondition || "Npay 결제 시 (상세 내용 참조)";
        
        const rawStartDate = item.displayStartDate || item.startDate || "";
        const rawEndDate = item.displayEndDate || item.endDate || "기간 미정";
        const startKor = formatDateToKorean(rawStartDate);
        const endKor = formatDateToKorean(rawEndDate);
        const periodText = rawStartDate ? `${startKor} ~ ${endKor}` : endKor;

        const detailContent = `📌 [조건]\n${condition}\n\n📅 [이벤트 기간]\n${periodText}\n\n💡 자세한 유의사항은 혜택 받으러 가기 링크를 참조하세요.`;

        let cleanEndDate = "기간 미정";
        if (rawEndDate !== "기간 미정") cleanEndDate = rawEndDate.replace(/\./g, '-').split('T')[0];

        if (!scrapedDeals.some(deal => deal.title === title)) {
          scrapedDeals.push({
            title, content: detailContent, url: item.detailUrl || item.link || "https://pay.naver.com", 
            category: "쇼핑", sub_category: "네이버페이", author: "AutoBot", mall_name: item.promotionName, status: "진행중",
            end_date: cleanEndDate,
          });
        }
      });
    }
  } catch (e: any) { console.error("🚨 네이버페이 에러:", e.message); }

  // ====================================================================
  // [쇼핑 탭] 2. 🏪 CU 편의점
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
        scrapedDeals.push({
          title: `[CU편의점] ${title}`, content: "링크를 클릭하여 상세 혜택을 확인하세요.", url: CU_URL, 
          category: "쇼핑", sub_category: "CU", author: "AutoBot", mall_name: "CU", status: "진행중",
          end_date: parseSafeEndDate(rawDate),
        });
      }
    });
  } catch (e: any) { console.error("🚨 CU 크롤링 에러:", e.message); }

  // ====================================================================
  // [쇼핑 탭] 3. 💳 신용카드 혜택 (카드고릴라)
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
        scrapedDeals.push({
          title: `[카드혜택] ${title}`, content: "링크를 클릭하여 상세 혜택을 확인하세요.", url: link ? `https://www.cardgorilla.com${link}` : CARD_URL, 
          category: "쇼핑", sub_category: "카드혜택", author: "AutoBot", mall_name: "카드고릴라", status: "진행중",
          end_date: parseSafeEndDate(rawDate),
        });
      }
    });
  } catch (e: any) { console.error("🚨 카드고릴라 에러:", e.message); }

  // ====================================================================
  // [쇼핑 탭] 4. 📱 통신사 멤버십 (SKT)
  // ====================================================================
  try {
    const TELECOM_URL = 'https://www.sktmembership.co.kr/epass/html/evt/event_list.jsp';
    const { data: telecomHtml } = await axios.get(TELECOM_URL, { headers: { 'user-agent': 'Mozilla/5.0' }, validateStatus: () => true });
    const $ = cheerio.load(telecomHtml);

    $('.event_list_wrap ul li').each((index, element) => {
      const title = $(element).find('dt').text().trim();
      const rawDate = $(element).find('.date').text().trim(); 
      
      if (title) {
        scrapedDeals.push({
          title: `[T멤버십] ${title}`, content: "T멤버십 앱 또는 웹에서 상세 혜택을 확인하세요.", url: "https://sktmembership.co.kr", 
          category: "쇼핑", sub_category: "통신사혜택", author: "AutoBot", mall_name: "SKT", status: "진행중",
          end_date: parseSafeEndDate(rawDate), 
        });
      }
    });
  } catch (e: any) { console.error("🚨 통신사 에러:", e.message); }

  // ====================================================================
  // [여행 탭] 5. ✈️ 트립닷컴 (숙박/호텔)
  // ====================================================================
  try {
    const TRIP_URL = 'https://kr.trip.com/sale/deals/';
    const { data: tripHtml } = await axios.get(TRIP_URL, { headers: { 'user-agent': 'Mozilla/5.0' }, validateStatus: () => true });
    const $ = cheerio.load(tripHtml);

    $('a[href*="/sale/"]').each((index, element) => {
      const title = $(element).text().replace(/\s+/g, ' ').trim();
      const link = $(element).attr('href');
      if (title && title.length > 5 && !scrapedDeals.some(deal => deal.title.includes(title))) {
        scrapedDeals.push({
          title: `[트립닷컴] ${title}`, content: "글로벌 특가 및 할인코드는 공식 프로모션 링크를 확인하세요.", 
          url: link?.startsWith('http') ? link : `https://kr.trip.com${link}`, 
          category: "여행", sub_category: "숙박/호텔", author: "AutoBot", mall_name: "트립닷컴", status: "진행중", end_date: "기간 미정",
        });
      }
    });
  } catch (e: any) { console.error("🚨 트립닷컴 에러:", e.message); }

  // ====================================================================
  // [여행 탭] 6. 🏨 호텔스닷컴 (숙박/호텔)
  // ====================================================================
  try {
    const HOTELS_URL = 'https://kr.hotels.com/hotel-deals/';
    const { data: hotelsHtml } = await axios.get(HOTELS_URL, { headers: { 'user-agent': 'Mozilla/5.0' }, validateStatus: () => true });
    const $ = cheerio.load(hotelsHtml);

    $('h2, h3, .offer-card-title, .title').each((index, element) => {
      const title = $(element).text().trim();
      const parentLink = $(element).closest('a').attr('href');
      if (title && (title.includes('할인') || title.includes('특가'))) {
        scrapedDeals.push({
          title: `[호텔스닷컴] ${title}`, content: "호텔스닷컴 전용 할인 및 멤버십 혜택을 확인하세요.", 
          url: parentLink ? (parentLink.startsWith('http') ? parentLink : `https://kr.hotels.com${parentLink}`) : HOTELS_URL, 
          category: "여행", sub_category: "숙박/호텔", author: "AutoBot", mall_name: "호텔스닷컴", status: "진행중", end_date: "기간 미정",
        });
      }
    });
  } catch (e: any) { console.error("🚨 호텔스닷컴 에러:", e.message); }

  // ====================================================================
  // [여행 탭] 7. 🎢 마이리얼트립 (액티비티/렌트)
  // ====================================================================
  try {
    const MRT_URL = 'https://www.myrealtrip.com/promotions';
    const { data: mrtHtml } = await axios.get(MRT_URL, { headers: { 'user-agent': 'Mozilla/5.0' }, validateStatus: () => true });
    const $ = cheerio.load(mrtHtml);

    $('.promotion-item, a[href*="/promotions/"]').each((index, element) => {
      const title = $(element).find('.title, h3, p').first().text().trim() || $(element).text().trim();
      const link = $(element).attr('href') || $(element).closest('a').attr('href');
      const rawDate = $(element).find('.date, .period').text().trim();

      if (title && title.length > 5) {
        scrapedDeals.push({
          title: `[마이리얼트립] ${title}`, content: "입장권, 투어, 렌터카 선착순 혜택을 확인하세요.", 
          url: link?.startsWith('http') ? link : `https://www.myrealtrip.com${link}`, 
          category: "여행", sub_category: "액티비티/렌트", author: "AutoBot", mall_name: "마이리얼트립", status: "진행중",
          end_date: parseSafeEndDate(rawDate),
        });
      }
    });
  } catch (e: any) { console.error("🚨 마이리얼트립 에러:", e.message); }

  // ====================================================================
  // 8. DB 저장 및 자동 청소 로직
  // ====================================================================
  let newCount = 0;
  try {
    const { data: existingDeals } = await supabase.from('deals').select('title');
    const existingTitles = existingDeals?.map(d => d.title) || [];
    
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
      now.setHours(0, 0, 0, 0); 
      
      const toUpdateIds: number[] = [];
      const toDeleteIds: number[] = [];

      allDeals.forEach((deal: any) => {
        if (!deal.end_date || deal.end_date === "기간 미정") return;
        const endDate = new Date(deal.end_date);
        endDate.setHours(0, 0, 0, 0);

        if (isNaN(endDate.getTime())) return;

        const diffDays = (now.getTime() - endDate.getTime()) / (1000 * 3600 * 24);
        
        if (diffDays > 7) {
          toDeleteIds.push(deal.id); 
        } else if (diffDays > 0 && deal.status !== "종료") {
          toUpdateIds.push(deal.id); 
        }
      });

      if (toDeleteIds.length > 0) await supabase.from('deals').delete().in('id', toDeleteIds);
      if (toUpdateIds.length > 0) await supabase.from('deals').update({ status: '종료' }).in('id', toUpdateIds);
    }
  } catch (e: any) { console.error("🚨 청소 에러:", e.message); }

  console.log(`🎉 크롤링 완료! 쇼핑+여행 합쳐서 새로운 글 ${newCount}개 추가됨.`);
  return NextResponse.json({ success: true, new_count: newCount, total_scraped: scrapedDeals.length });
} 