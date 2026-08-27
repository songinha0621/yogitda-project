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

// 💡 [2순위] 문장에 섞인 날짜를 무조건 YYYY-MM-DD로 뽑아내는 함수
const extractDate = (text: string) => {
  if (!text || text.includes('소진') || text.includes('미정')) return null;
  const cleanText = text.replace(/\s+/g, ''); 

  const regexFull = /(20\d{2})[.\-년/]+(0?[1-9]|1[0-2])[.\-월/]+(0?[1-9]|[12]\d|3[01])[일]*/g;
  const matchesFull = [...cleanText.matchAll(regexFull)];
  if (matchesFull.length > 0) {
    const last = matchesFull[matchesFull.length - 1]; 
    return `${last[1]}-${last[2].padStart(2, '0')}-${last[3].padStart(2, '0')}`;
  }

  const regexShortYear = /(?<!20)(\d{2})[.\-년/]+(0?[1-9]|1[0-2])[.\-월/]+(0?[1-9]|[12]\d|3[01])[일]*/g;
  const matchesShortYear = [...cleanText.matchAll(regexShortYear)];
  if (matchesShortYear.length > 0) {
    const last = matchesShortYear[matchesShortYear.length - 1];
    return `20${last[1]}-${last[2].padStart(2, '0')}-${last[3].padStart(2, '0')}`;
  }

  const regexNoYear = /(0?[1-9]|1[0-2])[.\-월/]+(0?[1-9]|[12]\d|3[01])[일]*/g;
  const matchesNoYear = [...cleanText.matchAll(regexNoYear)];
  if (matchesNoYear.length > 0) {
    const last = matchesNoYear[matchesNoYear.length - 1];
    const currentYear = new Date().getFullYear(); 
    return `${currentYear}-${last[1].padStart(2, '0')}-${last[2].padStart(2, '0')}`;
  }

  return null;
};

export async function GET() {
  console.log("🤖 [기획의 정석] 제목/본문/날짜 분할 크롤러 가동...");
  const scrapedDeals: any[] = [];  
  let totalScrapedCount = 0; 
  
  // 💡 [3순위 핵심] 각 쇼핑몰(mall_name)별로 현재 살아있는 이벤트 제목들을 저장하는 명부
  const liveTitlesByMall: Record<string, string[]> = {};
  const addLiveTitle = (mall: string, title: string) => {
    if (!liveTitlesByMall[mall]) liveTitlesByMall[mall] = [];
    liveTitlesByMall[mall].push(title);
  };

  let existingTitles: string[] = [];
  try {
    const { data: existingDeals } = await supabase.from('deals').select('title');
    existingTitles = existingDeals?.map(d => d.title) || [];
  } catch(e) {}

  const genericContent = "💡 상세 내용은 혜택 받으러 가기 링크를 통해 확인하세요.";

  // ====================================================================
  // 1. 네이버페이 (✨ 제목은 짧게, 조건은 본문에, 날짜는 D-day 역산!)
  // ====================================================================
  try {
    const NAVER_API_URL = 'https://pay.naver.com/web-api/pub/benefit/payment/accumulation-promotions?firstCategory=DOMESTIC_INSTORE&secondCategory=&page=1';
    const { data: naverData } = await axios.get(NAVER_API_URL, { headers: stealthHeaders });

    if (naverData?.elements) {
      totalScrapedCount += naverData.elements.length; 
      
      naverData.elements.forEach((item: any) => {
        // 💡 1. 제목: 깔끔하게 이름만! (예: [뚜레쥬르] 클래식 롤케이크 증정)
        const title = `[${item.promotionName}] ${item.exposeTitle}`;
        
        // 💡 2. 본문 내용: 혜택 조건(예: 2만원 이상 결제 시)을 본문으로 밀어넣기
        let conditionText = item.exposeCondition || item.benefitCondition || item.conditionText || "";
        conditionText = conditionText.replace(/\n/g, ' ').trim();
        const detailContent = conditionText ? `📌 [조건]\n${conditionText}\n\n${genericContent}` : genericContent;
        
        const link = item.detailUrl || item.link || "https://pay.naver.com";
        
        addLiveTitle(item.promotionName, title); // 실시간 명부에 등록

        if (!existingTitles.includes(title)) {
          
          // 💡 3. 날짜: D-Day 꼼수 및 명시적 날짜 역산 (상세페이지 접속 X)
          let calculatedEndDate = null;
          const rawJson = JSON.stringify(item);

          // 3-1: 대놓고 주는 날짜 텍스트가 있는지 확인
          const explicitDate = item.endDate || item.endDt || item.displayEndDate || item.endYmd;
          if (explicitDate) {
            calculatedEndDate = extractDate(String(explicitDate));
          }

          // 3-2: "D-3" 같은 문구를 발견하면 오늘 날짜 기준 +3일로 자동 계산
          if (!calculatedEndDate) {
            const dDayMatch = rawJson.match(/"D-(\d+)"/i) || rawJson.match(/"[a-zA-Z]*(?:dday|leftday|dayleft|remain)[a-zA-Z]*"\s*:\s*(\d+)/i);
            if (dDayMatch) {
              const daysLeft = parseInt(dDayMatch[1], 10);
              const targetDate = new Date();
              targetDate.setDate(targetDate.getDate() + daysLeft); 
              calculatedEndDate = targetDate.toISOString().split('T')[0];
            }
          }

          // 3-3: 그래도 없으면 JSON 전체에서 날짜 형태 숫자 찾아내기
          if (!calculatedEndDate) {
            const dateMatch = rawJson.match(/(202\d)[-./]?(0[1-9]|1[0-2])[-./]?(0[1-9]|[12]\d|3[01])/);
            if (dateMatch) {
              calculatedEndDate = `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`;
            }
          }

          scrapedDeals.push({
            title, content: detailContent, url: link, 
            category: "쇼핑", sub_category: "네이버페이", author: "AutoBot", mall_name: item.promotionName, status: "진행중", 
            end_date: calculatedEndDate, 
          });
        }
      });
    }
  } catch (e: any) { console.error("🚨 네이버페이 에러:", e.message); }

  // ====================================================================
  // 2. 버거킹
  // ====================================================================
  try {
    const BK_EVENT_URL = 'https://www.burgerking.co.kr/#/event';
    const { data: bkHtml } = await axios.get(BK_EVENT_URL, { headers: stealthHeaders, validateStatus: () => true });
    const $ = cheerio.load(bkHtml);
    $('.event_list li, .list_ev li').each((index, element) => {
      const rawTitle = $(element).find('.tit, .txt, strong').text().trim();
      const rawDateText = $(element).find('.date').text().trim() || $(element).text(); 
      const rawLink = $(element).find('a').attr('href');
      
      if (rawTitle && rawTitle.includes('프로모션')) {
        totalScrapedCount++;
        const title = `[버거킹] ${rawTitle}`;
        addLiveTitle("버거킹", title); 

        if (!existingTitles.includes(title)) {
          let finalLink = rawLink && rawLink.includes('event/detail') ? (rawLink.startsWith('http') ? rawLink : `https://www.burgerking.co.kr${rawLink.startsWith('/') ? '' : '/'}${rawLink}`) : BK_EVENT_URL;
          scrapedDeals.push({
            title, content: genericContent, url: finalLink, 
            category: "음식", sub_category: "버거킹", author: "AutoBot", mall_name: "버거킹", status: "진행중", 
            end_date: extractDate(rawDateText),
          });
        }
      }
    });
  } catch (e: any) {}

  // ====================================================================
  // 3. 통신사 SKT 
  // ====================================================================
  try {
    const TELECOM_URL = 'https://www.sktmembership.co.kr/epass/html/evt/event_list.jsp';
    const { data: telecomHtml } = await axios.get(TELECOM_URL, { headers: stealthHeaders, validateStatus: () => true });
    const $ = cheerio.load(telecomHtml);
    $('.event_list_wrap ul li').each((index, element) => {
      const rawTitle = $(element).find('dt').text().trim();
      const rawDateText = $(element).find('.date').text().trim() || $(element).text(); 
      if (rawTitle) {
        totalScrapedCount++;
        const title = `[T멤버십] ${rawTitle}`;
        addLiveTitle("SKT", title);

        if (!existingTitles.includes(title)) {
          scrapedDeals.push({
            title, content: genericContent, url: "https://sktmembership.co.kr", 
            category: "쇼핑", sub_category: "통신사혜택", author: "AutoBot", mall_name: "SKT", status: "진행중", 
            end_date: extractDate(rawDateText), 
          });
        }
      }
    });
  } catch (e: any) {}

  // ====================================================================
  // 4. 여행 3사 
  // ====================================================================
  try {
    const TRIP_URL = 'https://kr.trip.com/sale/deals/';
    const { data: tripHtml } = await axios.get(TRIP_URL, { headers: stealthHeaders });
    const $ = cheerio.load(tripHtml);
    $('a[href*="/sale/"]').each((index, element) => {
      const rawText = $(element).text().replace(/\s+/g, ' ').trim();
      const link = $(element).attr('href');
      if (rawText && rawText.length > 5) {
        totalScrapedCount++;
        const title = `[트립닷컴] ${rawText}`;
        addLiveTitle("트립닷컴", title);

        if (!existingTitles.includes(title)) {
          scrapedDeals.push({ 
            title, content: genericContent, url: link?.startsWith('http') ? link : `https://kr.trip.com${link}`, 
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
      const rawTitle = $(element).text().trim();
      const rawText = $(element).closest('a').text();
      const parentLink = $(element).closest('a').attr('href');
      if (rawTitle && (rawTitle.includes('할인') || rawTitle.includes('특가'))) {
        totalScrapedCount++;
        const title = `[호텔스닷컴] ${rawTitle}`;
        addLiveTitle("호텔스닷컴", title);

        if (!existingTitles.includes(title)) {
          scrapedDeals.push({ 
            title, content: genericContent, url: parentLink ? (parentLink.startsWith('http') ? parentLink : `https://kr.hotels.com${parentLink}`) : HOTELS_URL, 
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
      const rawTitle = $(element).find('.title, h3, p').first().text().trim() || $(element).text().trim();
      const rawDateText = $(element).find('.date, .period').text().trim() || $(element).text();
      const link = $(element).attr('href') || $(element).closest('a').attr('href');
      if (rawTitle && rawTitle.length > 5) {
        totalScrapedCount++;
        const title = `[마이리얼트립] ${rawTitle}`;
        addLiveTitle("마이리얼트립", title);

        if (!existingTitles.includes(title)) {
          scrapedDeals.push({ 
            title, content: genericContent, url: link?.startsWith('http') ? link : `https://www.myrealtrip.com${link}`, 
            category: "여행", sub_category: "액티비티/렌트", author: "AutoBot", mall_name: "마이리얼트립", status: "진행중", end_date: extractDate(rawDateText) 
          });
        }
      }
    });
  } catch (e: any) {}

  // ====================================================================
  // 5. CU 편의점 
  // ====================================================================
  try {
    const CU_URL = 'https://cu.bgfretail.com/brand_info/news_list.do?category=event';
    const { data: cuHtml } = await axios.get(CU_URL, { headers: stealthHeaders, validateStatus: () => true });
    const $ = cheerio.load(cuHtml);
    $('.event_list li, .relm_list li, .info_event li, table tbody tr').each((index, element) => {
      const rawTitle = $(element).find('.tit, .txt, .subject, a').first().text().trim();
      const rawDateText = $(element).find('.date, .time, td:nth-child(3)').text().trim() || $(element).text(); 
      const rawLink = $(element).find('a').attr('href');
      if (rawTitle && rawTitle.length > 2) {
        totalScrapedCount++;
        const title = `[CU] ${rawTitle}`;
        addLiveTitle("CU", title);

        if (!existingTitles.includes(title)) {
          scrapedDeals.push({
            title, content: genericContent, url: rawLink ? (rawLink.startsWith('http') ? rawLink : `https://cu.bgfretail.com${rawLink}`) : CU_URL, 
            category: "음식", sub_category: "편의점", author: "AutoBot", mall_name: "CU", status: "진행중", end_date: extractDate(rawDateText),
          });
        }
      }
    });
  } catch (e: any) {}

  // ====================================================================
  // 6. 맥도날드 
  // ====================================================================
  try {
    const MAC_URL = 'https://www.mcdonalds.co.kr/kor/promotion/list.do';
    const { data: macHtml } = await axios.get(MAC_URL, { headers: stealthHeaders, validateStatus: () => true });
    const $ = cheerio.load(macHtml);
    $('.promList li, .promotion_list li, div.contArea li').each((index, element) => {
      const rawTitle = $(element).find('.tit, strong, h3').first().text().trim() || $(element).text().trim();
      const rawDateText = $(element).find('.date, .term, p.info').text().trim() || $(element).text();
      const rawLink = $(element).find('a').attr('href');
      if (rawTitle && rawTitle.length > 2) {
        totalScrapedCount++;
        const title = `[맥도날드] ${rawTitle}`;
        addLiveTitle("맥도날드", title);

        if (!existingTitles.includes(title)) {
          scrapedDeals.push({
            title, content: genericContent, url: rawLink ? `https://www.mcdonalds.co.kr${rawLink}` : MAC_URL, 
            category: "음식", sub_category: "맥도날드", author: "AutoBot", mall_name: "맥도날드", status: "진행중", end_date: extractDate(rawDateText),
          });
        }
      }
    });
  } catch (e: any) {}

  // ====================================================================
  // 7. 써브웨이 
  // ====================================================================
  try {
    const SUB_URL = 'https://www.subway.co.kr/eventList';
    const { data: subHtml } = await axios.get(SUB_URL, { headers: stealthHeaders, validateStatus: () => true });
    const $ = cheerio.load(subHtml);
    $('.event_list li, .event-item, div.pd_list_wrap li').each((index, element) => {
      const rawTitle = $(element).find('.title, strong, h3, h4').first().text().trim();
      const rawDateText = $(element).find('.date, .period, p').text().trim() || $(element).text();
      const rawLink = $(element).find('a').attr('href');
      if (rawTitle && rawTitle.length > 2) {
        totalScrapedCount++;
        const title = `[써브웨이] ${rawTitle}`;
        addLiveTitle("써브웨이", title);

        if (!existingTitles.includes(title)) {
          scrapedDeals.push({
            title, content: genericContent, url: rawLink ? `https://www.subway.co.kr${rawLink}` : SUB_URL, 
            category: "음식", sub_category: "써브웨이", author: "AutoBot", mall_name: "써브웨이", status: "진행중", end_date: extractDate(rawDateText),
          });
        }
      }
    });
  } catch (e: any) {}

  // ====================================================================
  // 8. 도미노피자 
  // ====================================================================
  try {
    const DOMINO_URL = 'https://web.dominos.co.kr/event/list?gubun=E0200';
    const { data: dominoHtml } = await axios.get(DOMINO_URL, { headers: stealthHeaders, validateStatus: () => true });
    const $ = cheerio.load(dominoHtml);
    $('.event_list_wrap li, .event-list li, article.event-list li').each((index, element) => {
      const rawTitle = $(element).find('.tit, .subject, strong, p').first().text().trim();
      const rawDateText = $(element).find('.date, .term, p.term').text().trim() || $(element).text();
      const rawLink = $(element).find('a').attr('href');
      if (rawTitle && rawTitle.length > 2) {
        totalScrapedCount++;
        const title = `[도미노피자] ${rawTitle}`;
        addLiveTitle("도미노피자", title);

        if (!existingTitles.includes(title)) {
          scrapedDeals.push({
            title, content: genericContent, url: rawLink ? `https://web.dominos.co.kr${rawLink}` : DOMINO_URL, 
            category: "음식", sub_category: "도미노피자", author: "AutoBot", mall_name: "도미노피자", status: "진행중", end_date: extractDate(rawDateText),
          });
        }
      }
    });
  } catch (e: any) {}

  // ====================================================================
  // 9. DB 저장 및 [초정밀] 자동 마감 청소 로직
  // ====================================================================
  let newCount = 0;
  try {
    if (scrapedDeals.length > 0) {
      await supabase.from('deals').insert(scrapedDeals);
      newCount = scrapedDeals.length;
    }
  } catch(e: any) {}

  try {
    const { data: activeDeals } = await supabase.from('deals').select('id, title, end_date, mall_name, status').neq('status', '종료');
    
    if (activeDeals) {
      const now = new Date();
      now.setHours(0, 0, 0, 0); 
      
      const toUpdateIds: number[] = [];
      const toDeleteIds: number[] = [];

      activeDeals.forEach((deal: any) => {
        let isZombieOrExpired = false;

        // [2순위 작동] 날짜가 적혀 있다면 날짜를 기준으로 마감 판단
        if (deal.end_date) {
          const endDate = new Date(deal.end_date);
          endDate.setHours(0, 0, 0, 0);
          if (!isNaN(endDate.getTime())) {
            const diffDays = (now.getTime() - endDate.getTime()) / (1000 * 3600 * 24);
            if (diffDays > 7) { toDeleteIds.push(deal.id); return; } 
            if (diffDays > 0) isZombieOrExpired = true; 
          }
        }

        // [3순위 작동] 원본 사이트 명부에서 사라졌다면 즉시 좀비로 간주하고 마감 처리!
        if (!isZombieOrExpired && deal.mall_name && liveTitlesByMall[deal.mall_name] && liveTitlesByMall[deal.mall_name].length > 0) {
          if (!liveTitlesByMall[deal.mall_name].includes(deal.title)) {
            isZombieOrExpired = true; 
          }
        }

        if (isZombieOrExpired) {
          toUpdateIds.push(deal.id);
        }
      });

      // DB 업데이트 실행
      if (toDeleteIds.length > 0) await supabase.from('deals').delete().in('id', toDeleteIds);
      if (toUpdateIds.length > 0) await supabase.from('deals').update({ status: '종료' }).in('id', toUpdateIds);
      
      console.log(`🧹 [좀비 청소 완료] ${toUpdateIds.length}개의 만료된 이벤트가 종료 탭으로 이동되었습니다.`);
    }
  } catch (e: any) {}

  console.log(`🎉 [크롤러 완료] 새로운 글 ${newCount}개 추가됨.`);
  return NextResponse.json({ success: true, new_count: newCount, total_scraped: totalScrapedCount });
}