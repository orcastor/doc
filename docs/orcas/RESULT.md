# 测试结果

|项|配置|
|-|-|
|CPU|2.3 GHz 双核Intel Core i5|
|内存|8 GB 2133 MHz LPDDR3|
|读取|USB2.0外挂移动硬盘，西数 2T HDD，exFAT文件系统|
|写入|PCIE本地 120G SSD盘，apfs文件系统|
|设置|同步写入，16路并发，开启zstd压缩，秒传`FULL`，其余默认|

## 测试代码

### 设置

```go
var cfg = Config{
	DataSync: true,
	RefLevel: FAST,
	WiseCmpr: core.DATA_CMPR_ZSTD,
	//EndecWay: core.DATA_ENDEC_AES256,
	//EndecKey: "1234567890abcdef12345678",
	DontSync: ".*",
	WorkersN: 16,
}
```

### 上传

```go
func TestUpload(t *testing.T) {
	Convey("upload dir", t, func() {
		c := context.TODO()
		sdk := New(core.NewRWHandler())
		defer sdk.Close()

		sdk.SetConfig(cfg)
		So(sdk.Upload(c, bktID, core.ROOT_OID, path), ShouldBeNil)
	})
}
```

### 下载

```go
func TestDownload(t *testing.T) {
	Convey("download dir", t, func() {
		c := context.TODO()
		sdk := New(core.NewRWHandler())
		defer sdk.Close()

		sdk.SetConfig(cfg)
		id, _ := sdk.Path2ID(c, bktID, core.ROOT_OID, filepath.Base(path))
		fmt.Println(id)
		fmt.Println(sdk.ID2Path(c, bktID, id))

		So(sdk.Download(c, bktID, id, mntPath), ShouldBeNil)
	})
}
```

## 小文件

### 准备了1W个相同内容的4K小文件

|项|结果|
|-|-|
|速率|上传9秒 ≈1111 iter/s，下载3秒 ≈3333 iter/s|
|空间|原始文件夹39MB，写入数据23B(*磁盘占用要看文件系统分块情况)、元数据2.1MB|

```shell
/usr/local/go/bin/go test github.com/orcastor/orcas/sdk -v
=== RUN   TestUpload
--- PASS: TestUpload (8.98s)
=== RUN   TestDownload
--- PASS: TestDownload (3.00s)
PASS
ok  	github.com/orcastor/orcas/sdk	12.013s
```

## 大文件

### 准备了2个dmg文件（1.07GB + 920.8MB）

|项|结果|
|-|-|
|速率|上传20秒 ≈101.88 MB/s，下载12秒 ≈169.81 MB/s|
|空间|原始文件夹1.99GB，写入后1.8GB|

```shell
/usr/local/go/bin/go test github.com/orcastor/orcas/sdk -v
=== RUN   TestUpload
--- PASS: TestUpload (20.20s)
=== RUN   TestDownload
--- PASS: TestDownload (12.23s)
PASS
ok  	github.com/orcastor/orcas/sdk	32.432s
```