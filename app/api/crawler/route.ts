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
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none'
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
  console.log("🤖 [버거킹 찐프로모션 정밀타격판] 크롤러 가동 시작...");
  const scrapedDeals: any[] = [];  
  let totalScrapedCount = 0; 

  let existingTitles: string[] = [];
  try {
    const { data: existingDeals } = await supabase.from('deals').select('title');
    existingTitles = existingDeals?.map(d => d.title) || [];
  } catch(e) { console.error("DB 로드 에러"); }

  // ====================================================================
  // 1. 🟢 네이버페이 (공식 API)
  // ====================================================================
  try {
    const NAVER_API_URL = 'https://pay.naver.com/web-api/pub/benefit/payment/accumulation-promotions?firstCategory=DOMESTIC_INSTORE&secondCategory=&page=1';
    const { data: naverData } = await axios.get(NAVER_API_URL, { headers: stealthHeaders });

    if (naverData?.elements) {
      totalScrapedCount += naverData.elements.length; 
      
      const newNaverItems = naverData.elements.filter((item: any) => {
        const title = `[${item.promotionName}] ${item.exposeTitle}`;
        return !existingTitles.includes(title);
      });

      const naverPromises = newNaverItems.map(async (item: any) => {
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
        } catch (e: any) { }

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
      results.forEach(res => { if (res) scrapedDeals.push(res); });
    }
  } catch (e: any) { console.error("🚨 네이버페이 에러:", e.message); }

  // ====================================================================
  // 2. 🍔 버거킹 (오직 '프로모션' 단어가 포함된 진짜 할인만 타격!)
  // ====================================================================
  try {
    const BK_EVENT_URL = 'https://www.burgerking.co.kr/#/event';
    const { data: bkHtml } = await axios.get(BK_EVENT_URL, { headers: stealthHeaders, validateStatus: () => true });
    const $ = cheerio.load(bkHtml);

    $('.event_list li, .list_ev li').each((index, element) => {
      const title = $(element).find('.tit, .txt').text().trim();
      const rawDate = $(element).find('.date').text().trim();
      const rawLink = $(element).find('a').attr('href');
      
      // 💡 대표님 지시사항 적용: 제목에 '프로모션'이 들어간 글만 통과시킵니다.
      if (title && title.includes('프로모션')) {
        totalScrapedCount++;
        if (!existingTitles.includes(`[버거킹] ${title}`)) {
          
          let finalLink = BK_EVENT_URL;
          if (rawLink && rawLink.includes('event/detail')) {
            finalLink = rawLink.startsWith('http') ? rawLink : `https://www.burgerking.co.kr${rawLink.startsWith('/') ? '' : '/'}${rawLink}`;
          }

          scrapedDeals.push({
            title: `[버거킹] ${title}`, 
            content: "버거킹 공식 앱 또는 홈페이지에서 상세 혜택을 확인하세요.", 
            url: finalLink, 
            category: "음식", sub_category: "패스트푸드", author: "AutoBot", mall_name: "버거킹", status: "진행중", end_date: parseSafeEndDate(rawDate),
          });
        }
      }
    });
  } catch (e: any) { console.error("🚨 버거킹 에러:", e.message); }

  // ====================================================================
  // 3. 📱 통신사 멤버십 (SKT 공식 웹)
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
  } catch (e: any) { console.error("🚨 통신사 에러:", e.message); }

  // ====================================================================
  // 4, 5, 6. ✈️ 글로벌 여행 3대장 (공식 사이트)
  // ====================================================================
  try {
    const TRIP_URL = 'https://kr.trip.com/sale/deals/';
    const { data: tripHtml } = await axios.get(TRIP_URL, { headers: stealthHeaders, validateStatus: () => true });
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
            category: "여행", sub_category: "숙박/호텔", author: "AutoBot", mall_name: "트립닷컴", status: "진행중", end_date: "기간 미정",
          });
        }
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
        totalScrapedCount++;
        if (!existingTitles.includes(`[호텔스닷컴] ${title}`)) {
          scrapedDeals.push({
            title: `[호텔스닷컴] ${title}`, content: "호텔스닷컴 전용 할인 및 멤버십 혜택을 확인하세요.", 
            url: parentLink ? (parentLink.startsWith('http') ? parentLink : `https://kr.hotels.com${parentLink}`) : HOTELS_URL, 
            category: "여행", sub_category: "숙박/호텔", author: "AutoBot", mall_name: "호텔스닷컴", status: "진행중", end_date: "기간 미정",
          });
        }
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
  } catch (e: any) { console.error("🚨 마이리얼트립 에러:", e.message); }

  // ====================================================================
  // 7. DB 저장 및 자동 청소 로직
  // ====================================================================
  let newCount = 0;
  try {
    if (scrapedDeals.length > 0) {
      await supabase.from('deals').insert(scrapedDeals);
      newCount = scrapedDeals.length;
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
        
        if (diffDays > 7) toDeleteIds.push(deal.id); 
        else if (diffDays > 0 && deal.status !== "종료") toUpdateIds.push(deal.id); 
      });

      if (toDeleteIds.length > 0) await supabase.from('deals').delete().in('id', toDeleteIds);
      if (toUpdateIds.length > 0) await supabase.from('deals').update({ status: '종료' }).in('id', toUpdateIds);
    }
  } catch (e: any) { console.error("🚨 청소 에러:", e.message); }

  console.log(`🎉 [찐프로모션 정밀타격판] 새로운 글 ${newCount}개 추가됨. (총 ${totalScrapedCount}개 스캔완료)`);
  return NextResponse.json({ success: true, new_count: newCount, total_scraped: totalScrapedCount });
}