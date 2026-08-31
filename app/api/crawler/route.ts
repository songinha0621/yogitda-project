import { NextResponse } from 'next/server';
import axios from 'axios';
import { createClient } from '@supabase/supabase-js';
import * as cheerio from 'cheerio';

const SUPABASE_URL = "https://ntlxfdwpldcnsklmddzd.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im50bHhmZHdwbGRjbnNrbG1kZHpkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA5MjkyNTEsImV4cCI6MjA5NjUwNTI1MX0.TDwHNCITp08CXHmxyvO2haDgPMNbAXetFDwViATuJkI";
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// 💡 [핵심] 차단 우회를 위해 '최신 아이폰(iPhone)'으로 완벽 위장
const stealthHeaders = {
  'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
  'Cache-Control': 'no-cache',
  'Pragma': 'no-cache',
  'Upgrade-Insecure-Requests': '1'
};

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
    return `${new Date().getFullYear()}-${last[1].padStart(2, '0')}-${last[2].padStart(2, '0')}`;
  }
  return null;
};

// 💡 [핵심] JSON 깊은 곳에 숨겨진 세부 조건(2만원 이상 등)을 끝까지 추적해서 찾아내는 딥 서치 함수
const findDeepCondition = (obj: any): string => {
  if (!obj || typeof obj !== 'object') return "";
  for (const key of Object.keys(obj)) {
    const lowerKey = key.toLowerCase();
    if (lowerKey.includes('condition') || lowerKey.includes('desc')) {
      const val = obj[key];
      if (typeof val === 'string' && val.length >= 4 && val.length <= 60 && !val.includes('http')) {
        return val.replace(/\n/g, ' ').trim();
      }
    }
    if (typeof obj[key] === 'object') {
      const res = findDeepCondition(obj[key]);
      if (res) return res;
    }
  }
  return "";
};

export async function GET() {
  console.log("🤖 [아이폰 위장 + 딥 서치 탑재] 크롤러 가동 시작...");
  const scrapedDeals: any[] = [];  
  let totalScrapedCount = 0; 
  
  const liveTitlesBySubAndMall: Record<string, string[]> = {};
  const addLiveTitle = (sub: string, mall: string, title: string) => {
    const key = `${sub}_${mall}`;
    if (!liveTitlesBySubAndMall[key]) liveTitlesBySubAndMall[key] = [];
    liveTitlesBySubAndMall[key].push(title);
  };

  let existingTitles: string[] = [];
  try {
    const { data: existingDeals } = await supabase.from('deals').select('title');
    existingTitles = existingDeals?.map(d => d.title) || [];
  } catch(e) {}

  const genericContent = "💡 상세 내용은 혜택 받으러 가기 링크를 통해 확인하세요.";

  // ====================================================================
  // 1. 네이버페이 [현장결제 & 온라인]
  // ====================================================================
  const naverPayApis = [
    { url: 'https://pay.naver.com/web-api/pub/benefit/payment/accumulation-promotions?firstCategory=DOMESTIC_INSTORE&secondCategory=&page=1', sub: '네이버페이 현장결제' },
    { url: 'https://pay.naver.com/web-api/pub/benefit/payment/accumulation-promotions?firstCategory=ONLINE&secondCategory=&page=1', sub: '네이버페이 온라인' }
  ];

  for (const target of naverPayApis) {
    try {
      const { data: naverData } = await axios.get(target.url, { headers: stealthHeaders });
      if (naverData?.elements) {
        totalScrapedCount += naverData.elements.length; 
        
        naverData.elements.forEach((item: any) => {
          const title = `[${item.promotionName}] ${item.exposeTitle}`;
          
          // ✨ 딥 서치로 숨겨진 조건(2만원 이상 등) 무조건 발굴
          let conditionText = item.exposeCondition || item.benefitCondition || findDeepCondition(item);
          conditionText = String(conditionText).replace(/\n/g, ' ').trim();
          const detailContent = conditionText ? `📌 [조건]\n${conditionText}\n\n${genericContent}` : genericContent;
          
          const link = item.detailUrl || item.link || "https://pay.naver.com";
          addLiveTitle(target.sub, item.promotionName, title); 

          if (!existingTitles.includes(title)) {
            let calculatedEndDate = null;
            const rawJson = JSON.stringify(item);

            const explicitDate = item.endDate || item.endDt || item.displayEndDate || item.endYmd;
            if (explicitDate) calculatedEndDate = extractDate(String(explicitDate));

            if (!calculatedEndDate) {
              const dDayMatch = rawJson.match(/"D-(\d+)"/i) || rawJson.match(/"[a-zA-Z]*(?:dday|leftday|dayleft|remain)[a-zA-Z]*"\s*:\s*(\d+)/i);
              if (dDayMatch) {
                const targetDate = new Date();
                targetDate.setDate(targetDate.getDate() + parseInt(dDayMatch[1], 10)); 
                calculatedEndDate = targetDate.toISOString().split('T')[0];
              }
            }
            if (!calculatedEndDate) {
              const dateMatch = rawJson.match(/(202\d)[-./]?(0[1-9]|1[0-2])[-./]?(0[1-9]|[12]\d|3[01])/);
              if (dateMatch) calculatedEndDate = `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`;
            }

            scrapedDeals.push({
              title, content: detailContent, url: link, category: "쇼핑", sub_category: target.sub, 
              author: "AutoBot", mall_name: item.promotionName, status: "진행중", end_date: calculatedEndDate, 
            });
          }
        });
      }
    } catch (e: any) {}
  }

  // ====================================================================
  // 1-2. 네이버페이 [쿠폰]
  // ====================================================================
  try {
    const COUPON_URL = 'https://point.pay.naver.com/coupon/home/online';
    const { data: couponHtml } = await axios.get(COUPON_URL, { headers: stealthHeaders });
    const $c = cheerio.load(couponHtml);
    const nextDataStr = $c('#__NEXT_DATA__').html();

    if (nextDataStr) {
      const nextData = JSON.parse(nextDataStr);
      const findCoupons = (obj: any): any[] => {
          let found: any[] = [];
          if (!obj || typeof obj !== 'object') return found;
          const brand = obj.brandName || obj.merchantName || obj.partnerName || obj.promotionName;
          const benefit = obj.benefitName || obj.couponName || obj.title || obj.exposeTitle || obj.benefit;
          
          if (brand && benefit && typeof brand === 'string' && typeof benefit === 'string' && brand.length < 30 && benefit.length < 50) {
              if (('couponNo' in obj || 'couponId' in obj || 'validity' in obj || 'downloadUrl' in obj || 'benefit' in obj) && !('isError' in obj)) {
                  // 쿠폰 조건도 딥서치로 찾기
                  const condition = obj.benefitCondition || obj.exposeCondition || findDeepCondition(obj);
                  found.push({ brand, benefit, condition });
              }
          }
          for (const key in obj) { found = found.concat(findCoupons(obj[key])); }
          return found;
      };

      const extracted = findCoupons(nextData);
      const uniqueCoupons = Array.from(new Set(extracted.map(e => JSON.stringify(e)))).map((e: any) => JSON.parse(e));

      uniqueCoupons.forEach((c: any) => {
          const title = `[${c.brand}] ${c.benefit}`;
          let cText = c.condition ? String(c.condition).replace(/\n/g, ' ').trim() : "";
          const detailContent = cText ? `📌 [조건]\n${cText}\n\n${genericContent}` : genericContent;

          addLiveTitle("네이버페이 쿠폰", c.brand, title);
          if (!existingTitles.includes(title)) {
            totalScrapedCount++;
            scrapedDeals.push({
                title, content: detailContent, url: COUPON_URL, category: "쇼핑", sub_category: "네이버페이 쿠폰", 
                author: "AutoBot", mall_name: c.brand, status: "진행중", end_date: null,
            });
          }
      });
    }
  } catch (e: any) {}

  // ====================================================================
  // 1-3. 네이버페이 [블로그]
  // ====================================================================
  try {
    const BLOG_API = 'https://m.blog.naver.com/api/blogs/nv_npay/post-list?categoryNo=0&itemCount=5&page=1';
    const { data: blogData } = await axios.get(BLOG_API, { headers: stealthHeaders });
    if (blogData?.isSuccess && blogData?.result?.items) {
        blogData.result.items.forEach((item: any) => {
            const rawTitle = item.titleNoFormatting;
            if (rawTitle && (rawTitle.includes('이벤트') || rawTitle.includes('혜택') || rawTitle.includes('적립'))) {
                const title = `[네이버페이 공식블로그] ${rawTitle}`;
                if (!existingTitles.includes(title)) {
                    totalScrapedCount++;
                    scrapedDeals.push({
                        title, content: genericContent, url: `https://m.blog.naver.com/nv_npay/${item.logNo}`, 
                        category: "쇼핑", sub_category: "네이버페이 블로그", author: "AutoBot", mall_name: "네이버페이", status: "진행중", end_date: null, 
                    });
                }
            }
        });
    }
  } catch (e: any) {}

  // ====================================================================
  // 💡 [핵심] 프랜차이즈 스마트 진공청소기 탐색기 (태그 변경 무력화)
  // ====================================================================
  const franchiseTargets = [
    { url: 'https://www.burgerking.co.kr/event/ongoing', mall: '버거킹', cat: '음식', sub: '버거킹' },
    { url: 'https://www.mcdonalds.co.kr/kor/promotion/list.do', mall: '맥도날드', cat: '음식', sub: '맥도날드' },
    { url: 'https://www.subway.co.kr/eventList', mall: '써브웨이', cat: '음식', sub: '써브웨이' },
    { url: 'https://web.dominos.co.kr/event/list?gubun=E0200', mall: '도미노피자', cat: '음식', sub: '도미노피자' },
    { url: 'https://cu.bgfretail.com/brand_info/news_list.do?category=event', mall: 'CU', cat: '음식', sub: '편의점' }
  ];

  for (const target of franchiseTargets) {
    try {
      // 8초 안에 안주면 차단된 것으로 간주하고 빠져나옴 (서버 멈춤 방지)
      const { data: html } = await axios.get(target.url, { headers: stealthHeaders, validateStatus: () => true, timeout: 8000 });
      const $ = cheerio.load(html);
      
      // 지정 태그 무시! a 태그나 리스트 구조에서 혜택처럼 생긴 텍스트 덩어리를 싹쓸이
      $('li, article, div[class*="item"], div[class*="list"], a[href*="event"], a[href*="promo"]').each((_, el) => {
        const rawText = $(el).text().replace(/\s+/g, ' ').trim();
        const rawLink = $(el).find('a').attr('href') || $(el).attr('href') || "";
        
        // 너무 짧거나 긴 쓰레기 텍스트 거르고, 혜택 키워드 확인
        if (rawText.length > 5 && rawText.length < 150 && !rawText.includes('로그인')) {
          
          // 💡 [수정] 버거킹은 '프로모션' 포함 시에만, 그 외는 기존 키워드 모두 허용
          if (
            (target.mall === '버거킹' && rawText.includes('프로모션')) ||
            (target.mall !== '버거킹' && (rawText.includes('할인') || rawText.includes('프로모션') || rawText.includes('특가') || rawText.includes('이벤트')))
          ) {
            
            // 날짜나 쓸데없는 기호 앞부분까지만 깔끔하게 제목으로 잘라내기
            const cleanTitleMatch = rawText.match(/([가-힣a-zA-Z0-9\s!@#$%^&*()_+]+)/);
            let rawTitle = cleanTitleMatch ? cleanTitleMatch[1].trim() : rawText;
            if (rawTitle.length > 30) rawTitle = rawTitle.substring(0, 30) + "...";

            if (rawTitle.length > 2) {
              totalScrapedCount++;
              const title = `[${target.mall}] ${rawTitle}`;
              addLiveTitle(target.sub, target.mall, title);

              if (!existingTitles.includes(title)) {
                let finalLink = target.url;
                if (rawLink && rawLink.length > 2) {
                  finalLink = rawLink.startsWith('http') ? rawLink : new URL(rawLink, target.url).href;
                }
                
                scrapedDeals.push({
                  title, content: genericContent, url: finalLink, 
                  category: target.cat, sub_category: target.sub, author: "AutoBot", mall_name: target.mall, 
                  status: "진행중", end_date: extractDate(rawText),
                });
              }
            }
          }
        }
      });
    } catch (e: any) { console.log(`🚨 ${target.mall} 타격 실패 (서버 IP 차단 추정)`); }
  }

  // ====================================================================
  // 3. 여행 3사 (기존 로직 유지)
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
        const title = `[트립닷컴] ${rawText.substring(0, 40)}`;
        addLiveTitle("숙박/호텔", "트립닷컴", title);
        if (!existingTitles.includes(title)) {
          scrapedDeals.push({ title, content: genericContent, url: link?.startsWith('http') ? link : `https://kr.trip.com${link}`, category: "여행", sub_category: "숙박/호텔", author: "AutoBot", mall_name: "트립닷컴", status: "진행중", end_date: extractDate(rawText) });
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
        addLiveTitle("숙박/호텔", "호텔스닷컴", title);
        if (!existingTitles.includes(title)) {
          scrapedDeals.push({ title, content: genericContent, url: parentLink ? (parentLink.startsWith('http') ? parentLink : `https://kr.hotels.com${parentLink}`) : HOTELS_URL, category: "여행", sub_category: "숙박/호텔", author: "AutoBot", mall_name: "호텔스닷컴", status: "진행중", end_date: extractDate(rawText) });
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
        addLiveTitle("액티비티/렌트", "마이리얼트립", title);
        if (!existingTitles.includes(title)) {
          scrapedDeals.push({ title, content: genericContent, url: link?.startsWith('http') ? link : `https://www.myrealtrip.com${link}`, category: "여행", sub_category: "액티비티/렌트", author: "AutoBot", mall_name: "마이리얼트립", status: "진행중", end_date: extractDate(rawDateText) });
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
    const { data: activeDeals } = await supabase.from('deals').select('id, title, end_date, mall_name, sub_category, status').neq('status', '종료');
    
    if (activeDeals) {
      const now = new Date();
      now.setHours(0, 0, 0, 0); 
      
      const toUpdateIds: number[] = [];
      const toDeleteIds: number[] = [];

      activeDeals.forEach((deal: any) => {
        let isZombieOrExpired = false;

        if (deal.end_date) {
          const endDate = new Date(deal.end_date);
          endDate.setHours(0, 0, 0, 0);
          if (!isNaN(endDate.getTime())) {
            const diffDays = (now.getTime() - endDate.getTime()) / (1000 * 3600 * 24);
            if (diffDays > 7) { toDeleteIds.push(deal.id); return; } 
            if (diffDays > 0) isZombieOrExpired = true; 
          }
        }

        const key = `${deal.sub_category}_${deal.mall_name}`;
        if (!isZombieOrExpired && deal.mall_name && liveTitlesBySubAndMall[key] && liveTitlesBySubAndMall[key].length > 0) {
          if (!liveTitlesBySubAndMall[key].includes(deal.title)) {
            isZombieOrExpired = true; 
          }
        }

        if (isZombieOrExpired) {
          toUpdateIds.push(deal.id);
        }
      });

      if (toDeleteIds.length > 0) await supabase.from('deals').delete().in('id', toDeleteIds);
      if (toUpdateIds.length > 0) await supabase.from('deals').update({ status: '종료' }).in('id', toUpdateIds);
    }
  } catch (e: any) {}

  console.log(`🎉 [크롤러 완료] 새로운 글 ${newCount}개 추가됨.`);
  return NextResponse.json({ success: true, new_count: newCount, total_scraped: totalScrapedCount });
}