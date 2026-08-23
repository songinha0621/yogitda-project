import { NextResponse } from 'next/server';
import axios from 'axios';
import { createClient } from '@supabase/supabase-js';
import * as cheerio from 'cheerio';

const SUPABASE_URL = "https://ntlxfdwpldcnsklmddzd.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im50bHhmZHdwbGRjbnNrbG1kZHpkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA5MjkyNTEsImV4cCI6MjA5NjUwNTI1MX0.TDwHNCITp08CXHmxyvO2haDgPMNbAXetFDwViATuJkI";
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const stealthHeaders = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/html, application/xhtml+xml, */*;q=0.8',
  'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
  'Cache-Control': 'no-cache',
  'Pragma': 'no-cache',
  'Sec-Fetch-Dest': 'empty',
  'Sec-Fetch-Mode': 'cors',
  'Sec-Fetch-Site': 'same-origin',
};

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
  console.log("🤖 [최종 진화 완전체] 크롤러 가동 시작...");
  const scrapedDeals: any[] = [];  

  // ====================================================================
  // 1. 🟢 네이버페이 (상세 API 2중 타격 병렬 처리 유지)
  // ====================================================================
  try {
    const NAVER_API_URL = 'https://pay.naver.com/web-api/pub/benefit/payment/accumulation-promotions?firstCategory=DOMESTIC_INSTORE&secondCategory=&page=1';
    const { data: naverData } = await axios.get(NAVER_API_URL, { headers: stealthHeaders });

    if (naverData?.elements) {
      const naverPromises = naverData.elements.map(async (item: any) => {
        let title = `[${item.promotionName}] ${item.exposeTitle}`;
        let condition = item.exposeCondition || item.conditionText || item.benefitCondition;
        let rawStartDate = item.displayStartDate || item.startDate || "";
        let rawEndDate = item.displayEndDate || item.endDate || "기간 미정";
        const link = item.detailUrl || item.link || "https://pay.naver.com";

        try {
          const idMatch = link.match(/detail\/(\d+)/);
          if (idMatch) {
            const detailId = idMatch[1];
            const detailApiUrl = `https://pay.naver.com/web-api/pub/benefit/payment/accumulation-promotions/${detailId}`;
            const { data: detailData } = await axios.get(detailApiUrl, { headers: stealthHeaders, timeout: 3000 });
            
            const target = detailData?.promotion || detailData || {};
            if (target.benefitCondition || target.exposeCondition) condition = target.benefitCondition || target.exposeCondition;
            if (target.displayStartDate) rawStartDate = target.displayStartDate;
            if (target.displayEndDate) rawEndDate = target.displayEndDate;
          }
        } catch (e: any) {}

        condition = condition || "Npay 결제 시 (상세 내용 참조)";
        const startKor = formatDateToKorean(rawStartDate);
        const endKor = formatDateToKorean(rawEndDate);
        const periodText = rawStartDate ? `${startKor} ~ ${endKor}` : endKor;
        const detailContent = `📌 [조건]\n${condition}\n\n📅 [이벤트 기간]\n${periodText}\n\n💡 자세한 유의사항은 혜택 받으러 가기 링크를 참조하세요.`;

        let cleanEndDate = "기간 미정";
        if (rawEndDate !== "기간 미정") cleanEndDate = rawEndDate.replace(/\./g, '-').split('T')[0];

        return {
          title, content: detailContent, url: link, 
          category: "쇼핑", sub_category: "네이버페이", author: "AutoBot", mall_name: item.promotionName, status: "진행중", end_date: cleanEndDate,
        };
      });

      const results = await Promise.all(naverPromises);
      results.forEach(res => {
        if (res && !scrapedDeals.some(deal => deal.title === res.title)) scrapedDeals.push(res);
      });
    }
  } catch (e: any) { console.error("🚨 네이버페이 에러:", e.message); }

  // ====================================================================
  // 2. 🏪 CU 편의점 (⚡ 껍데기 우회 - 히든 AJAX POST 타격)
  // ====================================================================
  try {
    const CU_AJAX_URL = 'https://cu.bgfretail.com/brand_info/news_listAjax.do';
    const { data: cuHtml } = await axios.post(CU_AJAX_URL, "pageIndex=1", { 
      headers: { ...stealthHeaders, 'Content-Type': 'application/x-www-form-urlencoded' } 
    });
    const $ = cheerio.load(cuHtml);

    $('table.board_list tbody tr').each((index, element) => {
      const isNotice = $(element).find('img[alt="공지"]').length > 0;
      if (isNotice) return;
      const title = $(element).find('td.title a').text().trim();
      const rawDate = $(element).find('td').last().text().trim(); 
      if (title) {
        scrapedDeals.push({
          title: `[CU편의점] ${title}`, content: "링크를 클릭하여 상세 혜택을 확인하세요.", url: "https://cu.bgfretail.com/brand_info/news_list.do?category=brand_info&depth2=5", 
          category: "쇼핑", sub_category: "CU", author: "AutoBot", mall_name: "CU", status: "진행중", end_date: parseSafeEndDate(rawDate),
        });
      }
    });
  } catch (e: any) { console.error("🚨 CU 크롤링 에러:", e.message); }

  // ====================================================================
  // 3. 💳 신용카드 혜택 (⚡ 껍데기 우회 - 히든 JSON API 타격)
  // ====================================================================
  try {
    const CARD_API_URL = 'https://api.cardgorilla.com/v1/events?limit=30'; 
    const { data: cardRes } = await axios.get(CARD_API_URL, { headers: stealthHeaders });
    
    const events = cardRes?.data || cardRes || [];
    events.forEach((item: any) => {
      if (item.title) {
        const rawDate = `${item.startDate || ''} ~ ${item.endDate || ''}`;
        const link = `https://www.cardgorilla.com/event/detail/${item.id}`;
        scrapedDeals.push({
          title: `[카드혜택] ${item.title}`, content: "링크를 클릭하여 상세 혜택을 확인하세요.", url: link, 
          category: "쇼핑", sub_category: "카드혜택", author: "AutoBot", mall_name: "카드고릴라", status: "진행중", end_date: parseSafeEndDate(rawDate),
        });
      }
    });
  } catch (e: any) { console.error("🚨 카드고릴라 에러:", e.message); }

  // ====================================================================
  // 4. 📱 통신사 멤버십 (SKT - 기존 유지)
  // ====================================================================
  try {
    const TELECOM_URL = 'https://www.sktmembership.co.kr/epass/html/evt/event_list.jsp';
    const { data: telecomHtml } = await axios.get(TELECOM_URL, { headers: stealthHeaders, validateStatus: () => true });
    const $ = cheerio.load(telecomHtml);

    $('.event_list_wrap ul li').each((index, element) => {
      const title = $(element).find('dt').text().trim();
      const rawDate = $(element).find('.date').text().trim(); 
      if (title) {
        scrapedDeals.push({
          title: `[T멤버십] ${title}`, content: "T멤버십 앱 또는 웹에서 상세 혜택을 확인하세요.", url: "https://sktmembership.co.kr", 
          category: "쇼핑", sub_category: "통신사혜택", author: "AutoBot", mall_name: "SKT", status: "진행중", end_date: parseSafeEndDate(rawDate), 
        });
      }
    });
  } catch (e: any) { console.error("🚨 통신사 에러:", e.message); }

  // ====================================================================
  // 5, 6, 7. ✈️ 여행 탭 3대장 (기존 유지)
  // ====================================================================
  try {
    const TRIP_URL = 'https://kr.trip.com/sale/deals/';
    const { data: tripHtml } = await axios.get(TRIP_URL, { headers: stealthHeaders, validateStatus: () => true });
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

  try {
    const HOTELS_URL = 'https://kr.hotels.com/hotel-deals/';
    const { data: hotelsHtml } = await axios.get(HOTELS_URL, { headers: stealthHeaders, validateStatus: () => true });
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

  try {
    const MRT_URL = 'https://www.myrealtrip.com/promotions';
    const { data: mrtHtml } = await axios.get(MRT_URL, { headers: stealthHeaders, validateStatus: () => true });
    const $ = cheerio.load(mrtHtml);
    $('.promotion-item, a[href*="/promotions/"]').each((index, element) => {
      const title = $(element).find('.title, h3, p').first().text().trim() || $(element).text().trim();
      const link = $(element).attr('href') || $(element).closest('a').attr('href');
      const rawDate = $(element).find('.date, .period').text().trim();
      if (title && title.length > 5) {
        scrapedDeals.push({
          title: `[마이리얼트립] ${title}`, content: "입장권, 투어, 렌터카 선착순 혜택을 확인하세요.", 
          url: link?.startsWith('http') ? link : `https://www.myrealtrip.com${link}`, 
          category: "여행", sub_category: "액티비티/렌트", author: "AutoBot", mall_name: "마이리얼트립", status: "진행중", end_date: parseSafeEndDate(rawDate),
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

  console.log(`🎉 [최종 진화 완료] 새로운 글 ${newCount}개 추가됨.`);
  return NextResponse.json({ success: true, new_count: newCount, total_scraped: scrapedDeals.length });
}