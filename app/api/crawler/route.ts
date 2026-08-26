import { NextResponse } from 'next/server';
import axios from 'axios';
import { createClient } from '@supabase/supabase-js';
import * as cheerio from 'cheerio';

const SUPABASE_URL = "https://ntlxfdwpldcnsklmddzd.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im50bHhmZHdwbGRjbnNrbG1kZHpkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA5MjkyNTEsImV4cCI6MjA5NjUwNTI1MX0.TDwHNCITp08CXHmxyvO2haDgPMNbAXetFDwViATuJkI";
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const stealthHeaders = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  'Accept-Language': 'ko-KR,ko;q=0.9',
  'Cache-Control': 'no-cache'
};

// 💡 [초강력 날짜 추출기] 문장에 섞인 날짜를 무조건 YYYY-MM-DD로 뽑아내는 함수
const extractDate = (text: string) => {
  if (!text || text.includes('소진') || text.includes('미정')) return null;
  const cleanText = text.replace(/\s+/g, ''); // 공백을 모두 제거 (예: 8 월 3 일 -> 8월3일)

  // 1. YYYY.MM.DD 형태 (예: 2026.08.31, 2026-08-31, 2026년08월31일)
  const regexFull = /(20\d{2})[.\-년/]+(0?[1-9]|1[0-2])[.\-월/]+(0?[1-9]|[12]\d|3[01])[일]*/g;
  const matchesFull = [...cleanText.matchAll(regexFull)];
  if (matchesFull.length > 0) {
    const last = matchesFull[matchesFull.length - 1]; // 복수일 경우 뒤에 있는 종료일 선택
    return `${last[1]}-${last[2].padStart(2, '0')}-${last[3].padStart(2, '0')}`;
  }

  // 2. YY.MM.DD 형태 (예: 26.08.31)
  const regexShortYear = /(?<!20)(\d{2})[.\-년/]+(0?[1-9]|1[0-2])[.\-월/]+(0?[1-9]|[12]\d|3[01])[일]*/g;
  const matchesShortYear = [...cleanText.matchAll(regexShortYear)];
  if (matchesShortYear.length > 0) {
    const last = matchesShortYear[matchesShortYear.length - 1];
    return `20${last[1]}-${last[2].padStart(2, '0')}-${last[3].padStart(2, '0')}`;
  }

  // 3. MM.DD 형태 (예: 08.31, 8/31, 8월31일)
  const regexNoYear = /(0?[1-9]|1[0-2])[.\-월/]+(0?[1-9]|[12]\d|3[01])[일]*/g;
  const matchesNoYear = [...cleanText.matchAll(regexNoYear)];
  if (matchesNoYear.length > 0) {
    const last = matchesNoYear[matchesNoYear.length - 1];
    const currentYear = new Date().getFullYear(); // 연도가 생략된 경우 올해 년도 적용
    return `${currentYear}-${last[1].padStart(2, '0')}-${last[2].padStart(2, '0')}`;
  }

  return null;
};

export async function GET() {
  console.log("🤖 [제목+날짜 올인] 타겟 크롤러 가동 시작...");
  const scrapedDeals: any[] = [];  
  let totalScrapedCount = 0; 

  let existingTitles: string[] = [];
  try {
    const { data: existingDeals } = await supabase.from('deals').select('title');
    existingTitles = existingDeals?.map(d => d.title) || [];
  } catch(e) {}

  const genericContent = "💡 상세 내용은 혜택 받으러 가기 링크를 통해 확인하세요.";

  // ====================================================================
  // 1. 네이버페이 (상세 내용 포기! 제목과 링크만 초고속 수집)
  // ====================================================================
  try {
    const NAVER_API_URL = 'https://pay.naver.com/web-api/pub/benefit/payment/accumulation-promotions?firstCategory=DOMESTIC_INSTORE&secondCategory=&page=1';
    const { data: naverData } = await axios.get(NAVER_API_URL, { headers: stealthHeaders });

    if (naverData?.elements) {
      totalScrapedCount += naverData.elements.length; 
      const newNaverItems = naverData.elements.filter((item: any) => !existingTitles.includes(`[${item.promotionName}] ${item.exposeTitle}`));

      newNaverItems.forEach((item: any) => {
        const title = `[${item.promotionName}] ${item.exposeTitle}`;
        const link = item.detailUrl || item.link || "https://pay.naver.com";

        scrapedDeals.push({
          title, content: genericContent, url: link, 
          category: "쇼핑", sub_category: "네이버페이", author: "AutoBot", mall_name: item.promotionName, status: "진행중", 
          end_date: null, // 네이버는 날짜 수집 포기
        });
      });
    }
  } catch (e: any) { console.error("🚨 네이버페이 에러:", e.message); }

  // ====================================================================
  // 2. 버거킹 (날짜 집중 타격)
  // ====================================================================
  try {
    const BK_EVENT_URL = 'https://www.burgerking.co.kr/#/event';
    const { data: bkHtml } = await axios.get(BK_EVENT_URL, { headers: stealthHeaders, validateStatus: () => true });
    const $ = cheerio.load(bkHtml);
    $('.event_list li, .list_ev li').each((index, element) => {
      const title = $(element).find('.tit, .txt, strong').text().trim();
      const rawDateText = $(element).find('.date').text().trim() || $(element).text(); 
      const rawLink = $(element).find('a').attr('href');
      
      if (title && title.includes('프로모션')) {
        totalScrapedCount++;
        if (!existingTitles.includes(`[버거킹] ${title}`)) {
          let finalLink = rawLink && rawLink.includes('event/detail') ? (rawLink.startsWith('http') ? rawLink : `https://www.burgerking.co.kr${rawLink.startsWith('/') ? '' : '/'}${rawLink}`) : BK_EVENT_URL;
          scrapedDeals.push({
            title: `[버거킹] ${title}`, content: genericContent, url: finalLink, 
            category: "음식", sub_category: "버거킹", author: "AutoBot", mall_name: "버거킹", status: "진행중", 
            end_date: extractDate(rawDateText),
          });
        }
      }
    });
  } catch (e: any) {}

  // ====================================================================
  // 3. 통신사 SKT (날짜 집중 타격)
  // ====================================================================
  try {
    const TELECOM_URL = 'https://www.sktmembership.co.kr/epass/html/evt/event_list.jsp';
    const { data: telecomHtml } = await axios.get(TELECOM_URL, { headers: stealthHeaders, validateStatus: () => true });
    const $ = cheerio.load(telecomHtml);
    $('.event_list_wrap ul li').each((index, element) => {
      const title = $(element).find('dt').text().trim();
      const rawDateText = $(element).find('.date').text().trim() || $(element).text(); 
      if (title) {
        totalScrapedCount++;
        if (!existingTitles.includes(`[T멤버십] ${title}`)) {
          scrapedDeals.push({
            title: `[T멤버십] ${title}`, content: genericContent, url: "https://sktmembership.co.kr", 
            category: "쇼핑", sub_category: "통신사혜택", author: "AutoBot", mall_name: "SKT", status: "진행중", 
            end_date: extractDate(rawDateText), 
          });
        }
      }
    });
  } catch (e: any) {}

  // ====================================================================
  // 4. 여행 3사 (트립닷컴, 호텔스닷컴, 마이리얼트립)
  // ====================================================================
  try {
    const TRIP_URL = 'https://kr.trip.com/sale/deals/';
    const { data: tripHtml } = await axios.get(TRIP_URL, { headers: stealthHeaders });
    const $ = cheerio.load(tripHtml);
    $('a[href*="/sale/"]').each((index, element) => {
      const rawText = $(element).text().replace(/\s+/g, ' ').trim();
      const title = rawText; 
      const link = $(element).attr('href');
      if (title && title.length > 5) {
        totalScrapedCount++;
        if (!existingTitles.includes(`[트립닷컴] ${title}`)) {
          scrapedDeals.push({ 
            title: `[트립닷컴] ${title}`, content: genericContent, url: link?.startsWith('http') ? link : `https://kr.trip.com${link}`, 
            category: "여행", sub_category: "숙박/호텔", author: "AutoBot", mall_name: "트립닷컴", status: "진행중", end_date: extractDate(rawText)
          });
        }
      }
    });
  } catch (e: any) {}

  try {
    const HOTELS_URL = 'https://kr.hotels.com/hotel-deals/';
    const { data: hotelsHtml } = await axios.get(HOTELS_URL, { headers: stealthHeaders });
    const $ = cheerio.load(hotelsHtml);
    $('h2, h3, .offer-card-title, .title').each((index, element) => {
      const title = $(element).text().trim();
      const rawText = $(element).closest('a').text();
      const parentLink = $(element).closest('a').attr('href');
      if (title && (title.includes('할인') || title.includes('특가'))) {
        totalScrapedCount++;
        if (!existingTitles.includes(`[호텔스닷컴] ${title}`)) {
          scrapedDeals.push({ 
            title: `[호텔스닷컴] ${title}`, content: genericContent, url: parentLink ? (parentLink.startsWith('http') ? parentLink : `https://kr.hotels.com${parentLink}`) : HOTELS_URL, 
            category: "여행", sub_category: "숙박/호텔", author: "AutoBot", mall_name: "호텔스닷컴", status: "진행중", end_date: extractDate(rawText)
          });
        }
      }
    });
  } catch (e: any) {}

  try {
    const MRT_URL = 'https://www.myrealtrip.com/promotions';
    const { data: mrtHtml } = await axios.get(MRT_URL, { headers: stealthHeaders });
    const $ = cheerio.load(mrtHtml);
    $('.promotion-item, a[href*="/promotions/"]').each((index, element) => {
      const title = $(element).find('.title, h3, p').first().text().trim() || $(element).text().trim();
      const rawDateText = $(element).find('.date, .period').text().trim() || $(element).text();
      const link = $(element).attr('href') || $(element).closest('a').attr('href');
      if (title && title.length > 5) {
        totalScrapedCount++;
        if (!existingTitles.includes(`[마이리얼트립] ${title}`)) {
          scrapedDeals.push({ 
            title: `[마이리얼트립] ${title}`, content: genericContent, url: link?.startsWith('http') ? link : `https://www.myrealtrip.com${link}`, 
            category: "여행", sub_category: "액티비티/렌트", author: "AutoBot", mall_name: "마이리얼트립", status: "진행중", end_date: extractDate(rawDateText) 
          });
        }
      }
    });
  } catch (e: any) {}

  // ====================================================================
  // 5. CU 편의점 (날짜 집중 타격)
  // ====================================================================
  try {
    const CU_URL = 'https://cu.bgfretail.com/brand_info/news_list.do?category=event';
    const { data: cuHtml } = await axios.get(CU_URL, { headers: stealthHeaders, validateStatus: () => true });
    const $ = cheerio.load(cuHtml);
    $('.event_list li, .relm_list li, .info_event li, table tbody tr').each((index, element) => {
      const title = $(element).find('.tit, .txt, .subject, a').first().text().trim();
      const rawDateText = $(element).find('.date, .time, td:nth-child(3)').text().trim() || $(element).text(); 
      const rawLink = $(element).find('a').attr('href');
      if (title && title.length > 2) {
        totalScrapedCount++;
        if (!existingTitles.includes(`[CU] ${title}`)) {
          scrapedDeals.push({
            title: `[CU] ${title}`, content: genericContent, url: rawLink ? (rawLink.startsWith('http') ? rawLink : `https://cu.bgfretail.com${rawLink}`) : CU_URL, 
            category: "음식", sub_category: "편의점", author: "AutoBot", mall_name: "CU", status: "진행중", end_date: extractDate(rawDateText),
          });
        }
      }
    });
  } catch (e: any) {}

  // ====================================================================
  // 6. 맥도날드 (날짜 집중 타격)
  // ====================================================================
  try {
    const MAC_URL = 'https://www.mcdonalds.co.kr/kor/promotion/list.do';
    const { data: macHtml } = await axios.get(MAC_URL, { headers: stealthHeaders, validateStatus: () => true });
    const $ = cheerio.load(macHtml);
    $('.promList li, .promotion_list li, div.contArea li').each((index, element) => {
      const title = $(element).find('.tit, strong, h3').first().text().trim() || $(element).text().trim();
      const rawDateText = $(element).find('.date, .term, p.info').text().trim() || $(element).text();
      const rawLink = $(element).find('a').attr('href');
      if (title && title.length > 2) {
        totalScrapedCount++;
        if (!existingTitles.includes(`[맥도날드] ${title}`)) {
          scrapedDeals.push({
            title: `[맥도날드] ${title}`, content: genericContent, url: rawLink ? `https://www.mcdonalds.co.kr${rawLink}` : MAC_URL, 
            category: "음식", sub_category: "맥도날드", author: "AutoBot", mall_name: "맥도날드", status: "진행중", end_date: extractDate(rawDateText),
          });
        }
      }
    });
  } catch (e: any) {}

  // ====================================================================
  // 7. 써브웨이 (날짜 집중 타격)
  // ====================================================================
  try {
    const SUB_URL = 'https://www.subway.co.kr/eventList';
    const { data: subHtml } = await axios.get(SUB_URL, { headers: stealthHeaders, validateStatus: () => true });
    const $ = cheerio.load(subHtml);
    $('.event_list li, .event-item, div.pd_list_wrap li').each((index, element) => {
      const title = $(element).find('.title, strong, h3, h4').first().text().trim();
      const rawDateText = $(element).find('.date, .period, p').text().trim() || $(element).text();
      const rawLink = $(element).find('a').attr('href');
      if (title && title.length > 2) {
        totalScrapedCount++;
        if (!existingTitles.includes(`[써브웨이] ${title}`)) {
          scrapedDeals.push({
            title: `[써브웨이] ${title}`, content: genericContent, url: rawLink ? `https://www.subway.co.kr${rawLink}` : SUB_URL, 
            category: "음식", sub_category: "써브웨이", author: "AutoBot", mall_name: "써브웨이", status: "진행중", end_date: extractDate(rawDateText),
          });
        }
      }
    });
  } catch (e: any) {}

  // ====================================================================
  // 8. 도미노피자 (날짜 집중 타격)
  // ====================================================================
  try {
    const DOMINO_URL = 'https://web.dominos.co.kr/event/list?gubun=E0200';
    const { data: dominoHtml } = await axios.get(DOMINO_URL, { headers: stealthHeaders, validateStatus: () => true });
    const $ = cheerio.load(dominoHtml);
    $('.event_list_wrap li, .event-list li, article.event-list li').each((index, element) => {
      const title = $(element).find('.tit, .subject, strong, p').first().text().trim();
      const rawDateText = $(element).find('.date, .term, p.term').text().trim() || $(element).text();
      const rawLink = $(element).find('a').attr('href');
      if (title && title.length > 2) {
        totalScrapedCount++;
        if (!existingTitles.includes(`[도미노피자] ${title}`)) {
          scrapedDeals.push({
            title: `[도미노피자] ${title}`, content: genericContent, url: rawLink ? `https://web.dominos.co.kr${rawLink}` : DOMINO_URL, 
            category: "음식", sub_category: "도미노피자", author: "AutoBot", mall_name: "도미노피자", status: "진행중", end_date: extractDate(rawDateText),
          });
        }
      }
    });
  } catch (e: any) {}

  // ====================================================================
  // 9. DB 저장 및 자동 청소 로직
  // ====================================================================
  let newCount = 0;
  try {
    if (scrapedDeals.length > 0) {
      await supabase.from('deals').insert(scrapedDeals);
      newCount = scrapedDeals.length;
    }
  } catch(e: any) {}

  try {
    const { data: allDeals } = await supabase.from('deals').select('id, end_date, status');
    if (allDeals) {
      const now = new Date();
      now.setHours(0, 0, 0, 0); 
      
      const toUpdateIds: number[] = [];
      const toDeleteIds: number[] = [];

      allDeals.forEach((deal: any) => {
        if (!deal.end_date) return;
        const endDate = new Date(deal.end_date);
        endDate.setHours(0, 0, 0, 0);

        if (isNaN(endDate.getTime())) return;
        const diffDays = (now.getTime() - endDate.getTime()) / (1000 * 3600 * 24);
        
        if (diffDays > 7) toDeleteIds.push(deal.id); 
        else if (diffDays > 0 && deal.status !== "종료") toUpdateIds.push(deal.id); 
      });

      if (toDeleteIds.length > 0) await supabase.from('deals').delete().in('id', toDeleteIds);
      if (toUpdateIds.length > 0) await supabase.from('deals').update({ status: '종료' }).in('id', toUpdateIds);
    }
  } catch (e: any) {}

  console.log(`🎉 [타겟 집중 완료] 새로운 글 ${newCount}개 추가됨.`);
  return NextResponse.json({ success: true, new_count: newCount, total_scraped: totalScrapedCount });
}