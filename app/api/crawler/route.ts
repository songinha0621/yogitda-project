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
  'Cache-Control': 'no-cache',
  'Pragma': 'no-cache'
};

const unescapeUnicode = (str: string) => {
  if (!str) return str;
  return str.replace(/\\u([a-fA-F0-9]{4})/g, (g, m1) => String.fromCharCode(parseInt(m1, 16)));
};

const formatDateToKorean = (dateStr: string) => {
  if (!dateStr || dateStr.includes("미정")) return "기간 미정";
  if (dateStr.includes("년") && dateStr.includes("월")) return dateStr; // 이미 한글 포맷이면 그대로 반환
  const cleanStr = dateStr.replace(/\./g, '-').split('T')[0].split(' ')[0].trim(); 
  const dateObj = new Date(cleanStr);
  if (isNaN(dateObj.getTime())) return dateStr; 
  const year = dateObj.getFullYear();
  const month = dateObj.getMonth() + 1;
  const day = dateObj.getDate();
  const week = ['일', '월', '화', '수', '목', '금', '토'][dateObj.getDay()];
  return `${year}년 ${month}월 ${day}일 (${week})`;
};

const parseSafeEndDate = (rawDateStr: string) => {
  if (!rawDateStr || rawDateStr.includes('미정')) return null;
  let endPart = rawDateStr;
  if (rawDateStr.includes('~')) endPart = rawDateStr.split('~')[1];

  const cleanStr = endPart.replace(/\./g, '-').split('T')[0].split(' ')[0].trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(cleanStr)) return cleanStr;

  let match = endPart.match(/(20\d{2})[년\-\s]+(\d{1,2})[월\-\s]+(\d{1,2})[일\s]*/);
  if (match) return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;

  match = endPart.match(/(\d{1,2})[월\-\s]+(\d{1,2})[일\s]*/);
  if (match) {
    const currentYear = new Date().getFullYear();
    return `${currentYear}-${match[1].padStart(2, '0')}-${match[2].padStart(2, '0')}`;
  }
  return null;
};

export async function GET() {
  console.log("🤖 [크롤러 수정본] 네이버페이 딥서치 & 프랜차이즈 강제 추출 가동...");
  const scrapedDeals: any[] = [];  
  let totalScrapedCount = 0; 

  let existingTitles: string[] = [];
  try {
    const { data: existingDeals } = await supabase.from('deals').select('title');
    existingTitles = existingDeals?.map(d => d.title) || [];
  } catch(e) {}

  // ====================================================================
  // 1. 네이버페이 (__NEXT_DATA__ JSON 딥서치 적용)
  // ====================================================================
  try {
    const NAVER_API_URL = 'https://pay.naver.com/web-api/pub/benefit/payment/accumulation-promotions?firstCategory=DOMESTIC_INSTORE&secondCategory=&page=1';
    const { data: naverData } = await axios.get(NAVER_API_URL, { headers: stealthHeaders });

    if (naverData?.elements) {
      totalScrapedCount += naverData.elements.length; 
      
      const newNaverItems = naverData.elements.filter((item: any) => !existingTitles.includes(`[${item.promotionName}] ${item.exposeTitle}`));

      const naverPromises = newNaverItems.map(async (item: any) => {
        let title = `[${item.promotionName}] ${item.exposeTitle}`;
        let condition = item.exposeCondition || item.conditionText || item.benefitCondition || "";
        let rawStartDate = item.displayStartDate || item.startDate || "";
        let rawEndDate = item.displayEndDate || item.endDate || "";
        const link = item.detailUrl || item.link || "https://pay.naver.com";

        const idMatch = link.match(/detail\/(\d+)/);
        if (idMatch) {
          try {
            // 상세 페이지 HTML을 긁어와서 Next.js 내부 데이터를 강제로 뜯어냅니다.
            const detailHtmlRes = await axios.get(link, { headers: stealthHeaders, timeout: 3000 });
            const $ = cheerio.load(detailHtmlRes.data);
            const nextDataStr = $('#__NEXT_DATA__').html();
            
            if (nextDataStr) {
              const nextData = JSON.parse(nextDataStr);
              // JSON 내부를 끝까지 뒤져서 조건과 날짜를 찾아내는 함수
              const findKey = (obj: any, key: string): any => {
                if (!obj || typeof obj !== 'object') return null;
                if (key in obj) return obj[key];
                for (const k in obj) {
                  const res = findKey(obj[k], key);
                  if (res) return res;
                }
                return null;
              };
              
              const foundCond = findKey(nextData, 'exposeCondition') || findKey(nextData, 'benefitCondition');
              if (foundCond && typeof foundCond === 'string') condition = foundCond;
              
              const foundStart = findKey(nextData, 'displayStartDate');
              if (foundStart && typeof foundStart === 'string') rawStartDate = foundStart;
              
              const foundEnd = findKey(nextData, 'displayEndDate');
              if (foundEnd && typeof foundEnd === 'string') rawEndDate = foundEnd;
            }
          } catch (err: any) { }
        }

        condition = condition || "Npay 결제 시 (상세 내용 참조)";
        const startKor = formatDateToKorean(rawStartDate);
        const endKor = formatDateToKorean(rawEndDate);
        const periodText = rawStartDate && rawEndDate ? `${startKor} ~ ${endKor}` : (rawEndDate || "기간 미정");
        
        const detailContent = `📌 [조건]\n${condition}\n\n📅 [이벤트 기간]\n${periodText}\n\n💡 자세한 유의사항은 혜택 받으러 가기 링크를 참조하세요.`;

        return {
          title, content: detailContent, url: link, 
          category: "쇼핑", sub_category: "네이버페이", author: "AutoBot", mall_name: item.promotionName, status: "진행중", 
          end_date: parseSafeEndDate(rawEndDate), 
        };
      });

      const results = await Promise.all(naverPromises);
      results.forEach(res => { if (res) scrapedDeals.push(res); });
    }
  } catch (e: any) { }

  // ====================================================================
  // 2. 버거킹
  // ====================================================================
  try {
    const BK_EVENT_URL = 'https://www.burgerking.co.kr/#/event';
    const { data: bkHtml } = await axios.get(BK_EVENT_URL, { headers: stealthHeaders, validateStatus: () => true });
    const $ = cheerio.load(bkHtml);

    $('.event_list li, .list_ev li').each((index, element) => {
      const title = $(element).find('.tit, .txt, strong').text().trim();
      const rawDate = $(element).find('.date').text().trim();
      const rawLink = $(element).find('a').attr('href');
      
      if (title && title.includes('프로모션')) {
        totalScrapedCount++;
        if (!existingTitles.includes(`[버거킹] ${title}`)) {
          let finalLink = BK_EVENT_URL;
          if (rawLink && rawLink.includes('event/detail')) {
            finalLink = rawLink.startsWith('http') ? rawLink : `https://www.burgerking.co.kr${rawLink.startsWith('/') ? '' : '/'}${rawLink}`;
          }
          scrapedDeals.push({
            title: `[버거킹] ${title}`, content: "버거킹 공식 앱 또는 홈페이지에서 상세 혜택을 확인하세요.", url: finalLink, 
            category: "음식", sub_category: "패스트푸드", author: "AutoBot", mall_name: "버거킹", status: "진행중", 
            end_date: parseSafeEndDate(rawDate),
          });
        }
      }
    });
  } catch (e: any) { }

  // ====================================================================
  // 3. 통신사 (SKT)
  // ====================================================================
  try {
    const TELECOM_URL = 'https://www.sktmembership.co.kr/epass/html/evt/event_list.jsp';
    const { data: telecomHtml } = await axios.get(TELECOM_URL, { headers: stealthHeaders, validateStatus: () => true });
    const $ = cheerio.load(telecomHtml);

    $('.event_list_wrap ul li').each((index, element) => {
      const title = $(element).find('dt').text().trim();
      const rawDate = $(element).find('.date').text().trim(); 
      if (title) {
        totalScrapedCount++;
        if (!existingTitles.includes(`[T멤버십] ${title}`)) {
          scrapedDeals.push({
            title: `[T멤버십] ${title}`, content: "T멤버십 앱 또는 웹에서 상세 혜택을 확인하세요.", url: "https://sktmembership.co.kr", 
            category: "쇼핑", sub_category: "통신사혜택", author: "AutoBot", mall_name: "SKT", status: "진행중", end_date: parseSafeEndDate(rawDate), 
          });
        }
      }
    });
  } catch (e: any) { }

  // ====================================================================
  // 4, 5, 6. 여행 3대장 (트립닷컴, 호텔스닷컴, 마이리얼트립)
  // ====================================================================
  try {
    const TRIP_URL = 'https://kr.trip.com/sale/deals/';
    const { data: tripHtml } = await axios.get(TRIP_URL, { headers: stealthHeaders });
    const $ = cheerio.load(tripHtml);
    $('a[href*="/sale/"]').each((index, element) => {
      const title = $(element).text().replace(/\s+/g, ' ').trim();
      const link = $(element).attr('href');
      if (title && title.length > 5) {
        totalScrapedCount++;
        if (!existingTitles.includes(`[트립닷컴] ${title}`)) {
          scrapedDeals.push({
            title: `[트립닷컴] ${title}`, content: "글로벌 특가 및 할인코드는 공식 프로모션 링크를 확인하세요.", 
            url: link?.startsWith('http') ? link : `https://kr.trip.com${link}`, 
            category: "여행", sub_category: "숙박/호텔", author: "AutoBot", mall_name: "트립닷컴", status: "진행중", end_date: null,
          });
        }
      }
    });
  } catch (e: any) { }

  try {
    const HOTELS_URL = 'https://kr.hotels.com/hotel-deals/';
    const { data: hotelsHtml } = await axios.get(HOTELS_URL, { headers: stealthHeaders });
    const $ = cheerio.load(hotelsHtml);
    $('h2, h3, .offer-card-title, .title').each((index, element) => {
      const title = $(element).text().trim();
      const parentLink = $(element).closest('a').attr('href');
      if (title && (title.includes('할인') || title.includes('특가'))) {
        totalScrapedCount++;
        if (!existingTitles.includes(`[호텔스닷컴] ${title}`)) {
          scrapedDeals.push({
            title: `[호텔스닷컴] ${title}`, content: "호텔스닷컴 전용 할인 및 멤버십 혜택을 확인하세요.", 
            url: parentLink ? (parentLink.startsWith('http') ? parentLink : `https://kr.hotels.com${parentLink}`) : HOTELS_URL, 
            category: "여행", sub_category: "숙박/호텔", author: "AutoBot", mall_name: "호텔스닷컴", status: "진행중", end_date: null,
          });
        }
      }
    });
  } catch (e: any) { }

  try {
    const MRT_URL = 'https://www.myrealtrip.com/promotions';
    const { data: mrtHtml } = await axios.get(MRT_URL, { headers: stealthHeaders });
    const $ = cheerio.load(mrtHtml);
    $('.promotion-item, a[href*="/promotions/"]').each((index, element) => {
      const title = $(element).find('.title, h3, p').first().text().trim() || $(element).text().trim();
      const link = $(element).attr('href') || $(element).closest('a').attr('href');
      const rawDate = $(element).find('.date, .period').text().trim();
      if (title && title.length > 5) {
        totalScrapedCount++;
        if (!existingTitles.includes(`[마이리얼트립] ${title}`)) {
          scrapedDeals.push({
            title: `[마이리얼트립] ${title}`, content: "입장권, 투어, 렌터카 선착순 혜택을 확인하세요.", 
            url: link?.startsWith('http') ? link : `https://www.myrealtrip.com${link}`, 
            category: "여행", sub_category: "액티비티/렌트", author: "AutoBot", mall_name: "마이리얼트립", status: "진행중", end_date: parseSafeEndDate(rawDate),
          });
        }
      }
    });
  } catch (e: any) { }

  // ====================================================================
  // 7. CU 편의점 (선택자 강제 확장)
  // ====================================================================
  try {
    const CU_URL = 'https://cu.bgfretail.com/brand_info/news_list.do?category=event';
    const { data: cuHtml } = await axios.get(CU_URL, { headers: stealthHeaders, validateStatus: () => true });
    const $ = cheerio.load(cuHtml);
    $('.event_list li, .relm_list li, .info_event li, table tbody tr').each((index, element) => {
      const title = $(element).find('.tit, .txt, .subject, a').first().text().trim();
      const rawDate = $(element).find('.date, .time').text().trim(); 
      const rawLink = $(element).find('a').attr('href');
      if (title && title.length > 2) {
        totalScrapedCount++;
        if (!existingTitles.includes(`[CU] ${title}`)) {
          scrapedDeals.push({
            title: `[CU] ${title}`, content: "CU 편의점 공식 홈페이지 또는 포켓CU 앱에서 혜택을 확인하세요.", 
            url: rawLink ? (rawLink.startsWith('http') ? rawLink : `https://cu.bgfretail.com${rawLink}`) : CU_URL,
            category: "음식", sub_category: "편의점", author: "AutoBot", mall_name: "CU", status: "진행중", end_date: parseSafeEndDate(rawDate),
          });
        }
      }
    });
  } catch (e: any) { }

  // ====================================================================
  // 8. 맥도날드 (선택자 강제 확장)
  // ====================================================================
  try {
    const MAC_URL = 'https://www.mcdonalds.co.kr/kor/promotion/list.do';
    const { data: macHtml } = await axios.get(MAC_URL, { headers: stealthHeaders, validateStatus: () => true });
    const $ = cheerio.load(macHtml);
    $('.promList li, .promotion_list li, div.contArea li').each((index, element) => {
      const title = $(element).find('.tit, strong, h3').first().text().trim() || $(element).text().trim();
      const rawDate = $(element).find('.date, .term').text().trim();
      const rawLink = $(element).find('a').attr('href');
      if (title && title.length > 2) {
        totalScrapedCount++;
        if (!existingTitles.includes(`[맥도날드] ${title}`)) {
          scrapedDeals.push({
            title: `[맥도날드] ${title}`, content: "맥도날드 공식 홈페이지 또는 맥딜리버리 앱에서 혜택을 확인하세요.", 
            url: rawLink ? `https://www.mcdonalds.co.kr${rawLink}` : MAC_URL,
            category: "음식", sub_category: "패스트푸드", author: "AutoBot", mall_name: "맥도날드", status: "진행중", end_date: parseSafeEndDate(rawDate),
          });
        }
      }
    });
  } catch (e: any) { }

  // ====================================================================
  // 9. 써브웨이 (선택자 강제 확장)
  // ====================================================================
  try {
    const SUB_URL = 'https://www.subway.co.kr/eventList';
    const { data: subHtml } = await axios.get(SUB_URL, { headers: stealthHeaders, validateStatus: () => true });
    const $ = cheerio.load(subHtml);
    $('.event_list li, .event-item, div.pd_list_wrap li').each((index, element) => {
      const title = $(element).find('.title, strong, h3, h4').first().text().trim();
      const rawDate = $(element).find('.date, .period').text().trim();
      const rawLink = $(element).find('a').attr('href');
      if (title && title.length > 2) {
        totalScrapedCount++;
        if (!existingTitles.includes(`[써브웨이] ${title}`)) {
          scrapedDeals.push({
            title: `[써브웨이] ${title}`, content: "써브웨이 공식 홈페이지에서 행사 매장 및 상세 조건을 확인하세요.", 
            url: rawLink ? `https://www.subway.co.kr${rawLink}` : SUB_URL,
            category: "음식", sub_category: "패스트푸드", author: "AutoBot", mall_name: "써브웨이", status: "진행중", end_date: parseSafeEndDate(rawDate),
          });
        }
      }
    });
  } catch (e: any) { }

  // ====================================================================
  // 10. 도미노피자 (선택자 강제 확장)
  // ====================================================================
  try {
    const DOMINO_URL = 'https://web.dominos.co.kr/event/list?gubun=E0200';
    const { data: dominoHtml } = await axios.get(DOMINO_URL, { headers: stealthHeaders, validateStatus: () => true });
    const $ = cheerio.load(dominoHtml);
    $('.event_list_wrap li, .event-list li, article.event-list li').each((index, element) => {
      const title = $(element).find('.tit, .subject, strong, p').first().text().trim();
      const rawDate = $(element).find('.date, .term').text().trim();
      const rawLink = $(element).find('a').attr('href');
      if (title && title.length > 2) {
        totalScrapedCount++;
        if (!existingTitles.includes(`[도미노피자] ${title}`)) {
          scrapedDeals.push({
            title: `[도미노피자] ${title}`, content: "도미노피자 홈페이지 및 앱에서 방문포장/배달 할인 혜택을 확인하세요.", 
            url: rawLink ? `https://web.dominos.co.kr${rawLink}` : DOMINO_URL,
            category: "음식", sub_category: "피자", author: "AutoBot", mall_name: "도미노피자", status: "진행중", end_date: parseSafeEndDate(rawDate),
          });
        }
      }
    });
  } catch (e: any) { }

  // ====================================================================
  // 11. DB 저장 및 자동 청소 로직
  // ====================================================================
  let newCount = 0;
  try {
    if (scrapedDeals.length > 0) {
      await supabase.from('deals').insert(scrapedDeals);
      newCount = scrapedDeals.length;
    }
  } catch(e: any) { }

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
  } catch (e: any) { }

  console.log(`🎉 [크롤러 완료] 새로운 글 ${newCount}개 추가됨.`);
  return NextResponse.json({ success: true, new_count: newCount, total_scraped: totalScrapedCount });
}