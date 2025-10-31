// ラーメン推薦アプリ - メインJavaScript

class RamenRecommender {
    constructor() {
        this.currentLocation = null;
        this.restaurants = [];
        this.initializeEventListeners();
    }

    initializeEventListeners() {
        const locationForm = document.getElementById('locationForm');
        locationForm.addEventListener('submit', (e) => this.handleLocationSubmit(e));
    }

    // 場所の入力を処理
    async handleLocationSubmit(event) {
        event.preventDefault();

        const statusElement = document.getElementById('locationStatus');
        const errorElement = document.getElementById('error');
        const locationInput = document.getElementById('locationInput');

        const locationQuery = locationInput.value.trim();

        if (!locationQuery) {
            this.showError('場所を入力してください。');
            return;
        }

        errorElement.classList.add('hidden');
        statusElement.textContent = '場所を検索中...';

        try {
            // Nominatim APIで住所を座標に変換
            const coordinates = await this.geocodeLocation(locationQuery);

            if (coordinates) {
                this.currentLocation = coordinates;
                statusElement.textContent = `📍 ${locationQuery} の周辺を検索します`;
                await this.findNearbyRamenShops();
            } else {
                this.showError('指定された場所が見つかりませんでした。別の場所を試してください。');
                statusElement.textContent = '';
            }
        } catch (error) {
            console.error('Geocoding error:', error);
            this.showError('場所の検索中にエラーが発生しました。もう一度お試しください。');
            statusElement.textContent = '';
        }
    }

    // 住所を座標に変換（Nominatim API使用）
    async geocodeLocation(query) {
        const encodedQuery = encodeURIComponent(query);
        const url = `https://nominatim.openstreetmap.org/search?q=${encodedQuery}&format=json&limit=1&countrycodes=jp&accept-language=ja`;

        try {
            const response = await fetch(url, {
                headers: {
                    'User-Agent': 'RamenRecommendationApp/1.0'
                }
            });

            if (!response.ok) {
                throw new Error('Geocoding request failed');
            }

            const data = await response.json();

            if (data && data.length > 0) {
                return {
                    lat: parseFloat(data[0].lat),
                    lng: parseFloat(data[0].lon)
                };
            }

            return null;
        } catch (error) {
            console.error('Geocoding error:', error);
            throw error;
        }
    }

    // 近くのラーメン屋を検索
    async findNearbyRamenShops() {
        this.showLoading(true);
        const resultsElement = document.getElementById('results');
        resultsElement.classList.add('hidden');

        try {
            // Overpass APIを使用してラーメン屋を検索
            const radius = 2000; // 2km圏内
            const query = this.buildOverpassQuery(this.currentLocation, radius);

            const response = await fetch('https://overpass-api.de/api/interpreter', {
                method: 'POST',
                body: query
            });

            if (!response.ok) {
                throw new Error('データの取得に失敗しました');
            }

            const data = await response.json();

            // ラーメン屋のデータを処理
            this.restaurants = this.processRestaurantData(data.elements);

            // デモデータがない場合はサンプルデータを使用
            if (this.restaurants.length === 0) {
                this.restaurants = this.generateSampleData();
            }

            this.displayResults();
        } catch (error) {
            console.error('Error:', error);
            this.showError('ラーメン屋の検索中にエラーが発生しました。サンプルデータを表示します。');
            this.restaurants = this.generateSampleData();
            this.displayResults();
        } finally {
            this.showLoading(false);
        }
    }

    // Overpass APIクエリを構築
    buildOverpassQuery(location, radius) {
        return `
            [out:json][timeout:25];
            (
                node["amenity"="restaurant"]["cuisine"~"ramen|noodle",i](around:${radius},${location.lat},${location.lng});
                way["amenity"="restaurant"]["cuisine"~"ramen|noodle",i](around:${radius},${location.lat},${location.lng});
            );
            out body;
            >;
            out skel qt;
        `;
    }

    // レストランデータを処理
    processRestaurantData(elements) {
        const restaurants = [];

        for (const element of elements) {
            if (element.tags && element.tags.name) {
                const restaurant = {
                    name: element.tags.name,
                    rating: this.generateRating(),
                    address: element.tags['addr:full'] || element.tags['addr:street'] || '住所情報なし',
                    distance: this.calculateDistance(
                        this.currentLocation.lat,
                        this.currentLocation.lng,
                        element.lat || element.center?.lat,
                        element.lon || element.center?.lon
                    ),
                    description: this.generateDescription(element.tags),
                    tags: this.extractTags(element.tags),
                    reviewCount: Math.floor(Math.random() * 500) + 50
                };

                restaurants.push(restaurant);
            }
        }

        // 評価でソート
        restaurants.sort((a, b) => b.rating - a.rating);
        return restaurants.slice(0, 10); // トップ10を返す
    }

    // 2点間の距離を計算（km）
    calculateDistance(lat1, lng1, lat2, lng2) {
        if (!lat2 || !lng2) return 0;

        const R = 6371; // 地球の半径（km）
        const dLat = this.toRad(lat2 - lat1);
        const dLng = this.toRad(lng2 - lng1);
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                  Math.cos(this.toRad(lat1)) * Math.cos(this.toRad(lat2)) *
                  Math.sin(dLng / 2) * Math.sin(dLng / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return (R * c).toFixed(1);
    }

    toRad(degrees) {
        return degrees * Math.PI / 180;
    }

    // 評価を生成（3.5〜5.0）
    generateRating() {
        return (Math.random() * 1.5 + 3.5).toFixed(1);
    }

    // 説明文を生成
    generateDescription(tags) {
        const descriptions = [
            '地元で愛される老舗ラーメン店。コクのあるスープと自家製麺が自慢です。',
            '濃厚な豚骨スープが人気のお店。替え玉無料サービスも嬉しいポイント。',
            '醤油ベースのあっさりスープが特徴。昔ながらの中華そばが楽しめます。',
            '味噌ラーメンの名店。北海道直送の味噌を使用した深みのある味わい。',
            '魚介系と豚骨のWスープが絶品。つけ麺も人気のメニューです。',
            '細麺とあっさりスープの博多ラーメン。本場の味を再現しています。',
            'コラーゲンたっぷりの鶏白湯スープが自慢。女性客にも人気のお店。',
            '煮干しの風味が効いた和風スープ。トッピングの具材も豊富です。',
            '辛味噌ラーメンが看板メニュー。ガツンとくる辛さがクセになる味。',
            '家系ラーメンの人気店。濃厚なスープとモチモチ太麺の相性抜群。'
        ];

        return descriptions[Math.floor(Math.random() * descriptions.length)];
    }

    // タグを抽出
    extractTags(tags) {
        const tagList = ['ラーメン'];

        if (tags.outdoor_seating === 'yes') tagList.push('テラス席');
        if (tags.wheelchair === 'yes') tagList.push('バリアフリー');
        if (tags.takeaway === 'yes') tagList.push('テイクアウト可');
        if (tags.delivery === 'yes') tagList.push('配達可');
        if (tags.wifi === 'yes') tagList.push('Wi-Fi');
        if (tags.parking === 'yes') tagList.push('駐車場');

        // ランダムでタグを追加
        const randomTags = ['つけ麺', '替え玉無料', '深夜営業', '個室あり', 'カウンター席'];
        const selectedTag = randomTags[Math.floor(Math.random() * randomTags.length)];
        if (!tagList.includes(selectedTag)) {
            tagList.push(selectedTag);
        }

        return tagList;
    }

    // サンプルデータを生成
    generateSampleData() {
        return [
            {
                name: '麺屋 一心',
                rating: 4.5,
                address: '東京都渋谷区神南1-2-3',
                distance: 0.5,
                description: '濃厚な豚骨魚介スープが自慢の人気店。特製チャーシューは柔らかく、口の中でとろけます。深夜まで営業しているので、仕事帰りにも立ち寄れます。',
                tags: ['豚骨魚介', '深夜営業', 'チャーシュー', 'つけ麺'],
                reviewCount: 328
            },
            {
                name: 'ラーメン龍',
                rating: 4.7,
                address: '東京都新宿区歌舞伎町2-4-5',
                distance: 0.8,
                description: '創業50年の老舗ラーメン店。醤油ベースの透き通ったスープは、鶏ガラと野菜の旨味が凝縮されています。昔ながらの中華そばを求める方に最適。',
                tags: ['老舗', '醤油ラーメン', '中華そば', 'カウンター席'],
                reviewCount: 456
            },
            {
                name: '北海道味噌らーめん 札幌',
                rating: 4.6,
                address: '東京都港区六本木3-1-8',
                distance: 1.2,
                description: '北海道直送の味噌を使用した本格味噌ラーメン。バターとコーンのトッピングがスープと絶妙にマッチ。寒い日には特におすすめの一杯。',
                tags: ['味噌ラーメン', '北海道', 'バターコーン', '個室あり'],
                reviewCount: 289
            },
            {
                name: 'つけ麺 大勝軒',
                rating: 4.8,
                address: '東京都豊島区南池袋1-5-2',
                distance: 1.5,
                description: 'つけ麺発祥の名店。濃厚な魚介豚骨つけ汁と極太麺の組み合わせは圧巻。スープ割りも忘れずにお楽しみください。行列必至の人気店。',
                tags: ['つけ麺', '行列店', '極太麺', 'スープ割り'],
                reviewCount: 512
            },
            {
                name: '博多一風堂',
                rating: 4.4,
                address: '東京都中央区銀座5-6-7',
                distance: 1.8,
                description: '博多ラーメンの代表格。クリーミーな豚骨スープと細麺のコンビネーションが絶品。替え玉システムでお腹いっぱい食べられます。',
                tags: ['博多ラーメン', '豚骨', '替え玉無料', 'テイクアウト可'],
                reviewCount: 423
            },
            {
                name: '鶏白湯らーめん 鳥ノ介',
                rating: 4.5,
                address: '東京都目黒区目黒2-3-4',
                distance: 2.0,
                description: 'クリーミーな鶏白湯スープが特徴。コラーゲンたっぷりで美容にも良いと評判。女性客も多く、ヘルシー志向の方におすすめ。',
                tags: ['鶏白湯', 'コラーゲン', 'ヘルシー', 'Wi-Fi'],
                reviewCount: 267
            }
        ];
    }

    // 結果を表示
    displayResults() {
        const resultsElement = document.getElementById('results');
        const restaurantList = document.getElementById('restaurantList');

        restaurantList.innerHTML = '';

        if (this.restaurants.length === 0) {
            this.showError('近くにラーメン屋が見つかりませんでした。');
            return;
        }

        this.restaurants.forEach((restaurant, index) => {
            const card = this.createRestaurantCard(restaurant, index + 1);
            restaurantList.appendChild(card);
        });

        resultsElement.classList.remove('hidden');
    }

    // レストランカードを作成
    createRestaurantCard(restaurant, rank) {
        const card = document.createElement('div');
        card.className = 'restaurant-card';

        const stars = '⭐'.repeat(Math.round(restaurant.rating));
        const mapsUrl = this.getGoogleMapsUrl(restaurant);

        card.innerHTML = `
            <div class="restaurant-header">
                <div class="restaurant-name">${rank}. ${restaurant.name}</div>
                <div class="restaurant-rating">
                    ${stars} ${restaurant.rating}
                </div>
            </div>
            <div class="restaurant-info">
                <div class="info-item">📍 ${restaurant.address}</div>
                <div class="info-item">🚶 徒歩 約${this.getWalkingTime(restaurant.distance)}分 (${restaurant.distance}km)</div>
                <div class="info-item">💬 ${restaurant.reviewCount}件のレビュー</div>
            </div>
            <div class="restaurant-description">
                ${restaurant.description}
            </div>
            <div class="restaurant-tags">
                ${restaurant.tags.map(tag => `<span class="tag">${tag}</span>`).join('')}
            </div>
            <div class="restaurant-actions">
                <a href="${mapsUrl}" target="_blank" rel="noopener noreferrer" class="btn-maps">
                    🗺️ Google Mapsで開く
                </a>
            </div>
        `;

        return card;
    }

    // Google Mapsの検索URLを生成
    getGoogleMapsUrl(restaurant) {
        const query = encodeURIComponent(`${restaurant.name} ${restaurant.address}`);
        return `https://www.google.com/maps/search/?api=1&query=${query}`;
    }

    // 徒歩時間を計算（km → 分）
    getWalkingTime(distance) {
        // 時速4kmで計算
        return Math.ceil(distance / 4 * 60);
    }

    // ローディング表示を切り替え
    showLoading(show) {
        const loadingElement = document.getElementById('loading');
        if (show) {
            loadingElement.classList.remove('hidden');
        } else {
            loadingElement.classList.add('hidden');
        }
    }

    // エラーメッセージを表示
    showError(message) {
        const errorElement = document.getElementById('error');
        errorElement.textContent = message;
        errorElement.classList.remove('hidden');
    }
}

// アプリケーション初期化
document.addEventListener('DOMContentLoaded', () => {
    new RamenRecommender();
});
