# 设计方案

## 领域模型

实体包括用户、存储两种，它们之间的关联是访问和权限控制

- 用户分为管理员和普通用户

- 存储按类别分为元数据和数据

   - 元数据有桶信息、对象信息、数据信息，桶里面用有对象，每个对象信息可以关联数据信息，比如版本和预览的数据等，也可以不关联数据，比如目录和文件对象

![architecture](https://orcastor.github.io/doc//assets/img/arch.png)

## 存储设计

### 关于存储选型

数据部分为什么用自研存储而不是RocksDB？因为LSM类的实现存在写放大问题严重。元数据部分用关系型数据库存储因为查询和排序比较方便，也可以改用合适的KV存储，后续可以看场景和性能测试而定。

### 默认约定

1. 元数据和数据分开存储

提供存储适配器接口，这样你可以随意修改成你想要的实现。

2. 按对象大小分类存储

小对象支持打包存储，多个小文件打包成一个数据包上传；大对象存储分块存储，数据块默认按4MB切块，也即4194304B，读取大对象时，根据数据总大小计算出需要读取多少个块即可，理论上支持无限大的对象存储（前端因为受到浏览器自带的上传下载功能限制，支持大小受限）。

3. 数据只追加不修改（WORM， Write-Once-Read-Many）

这可以简化强一致问题，不再需要引入NRW quorum算法等，不再需要读取多个副本选择更新版本，只需要读取元数据中的最新版本即可，这样也就不需要使用Raft或者Paxos来解决多副本数据同步问题，单调递增的ID作为协议号，修改时间戳作为版本即可，修改时间戳需要保证时间不回跳。

4. 数据引用/秒传（对象级重复数据删除）

校验值满足完整性校验本身就需要提供，现在还能额外支持对象级重复数据删除，秒传的数据引用功能还能够用于云端复制和剪切功能，只需要提供索引（目录信息）即可。**`OrcaS`从一开始就支持秒传，数据独立于元数据，而非依附于元数据存在而存在（否则后续实现会相对比较复杂）**。

5. 支持常见压缩方法

支持snappy、zstd、gzip等。

6. 支持常见加密方法

保障数据私有安全，支持国密SM4、AES-256等，拥有正确密钥的设备才能在设备端访问数据（全链路）。

## 元数据设计

- 一般元数据存储会设计成全路径或者父子对象ID的方式

<table style="text-align: center">
   <tr>
      <td>方案</td>
      <td>优点</td>
      <td>缺点</td>
   </tr>
   <tr>
      <td>全路径</td>
      <td>前缀查询，定位较快<br/></td>
      <td>移动/重命名需要批量修改前缀，层级深的话，占用空间比较多</td>
   </tr>
   <tr>
      <td>父子ID</td>
      <td>移动可以配合秒传/数据引用功能简化</td>
      <td>需要每一级查询；客户端可能需要维护ID和名称的关系</td>
   </tr>
</table>

这里我们选择的是父子ID方案，当然也并不限制`name`，也可以在`name`中放置`/`来当对象存储使用。

### 【对象的属性】

- 父级的ID
- 对象名称
- 对象大小
- 创建时间
- 修改时间（如果没有，那就是创建时间）
- 访问时间（如果没有，那就是修改时间>创建时间）
- 对象的类型
- 数据ID
- 幂等操作ID
- 快照版本ID

``` go
type ObjectInfo struct {
	ID     int64  `borm:"id"`     // 对象ID（idgen随机生成的id）
	PID    int64  `borm:"pid"`    // 父对象ID
	MTime  int64  `borm:"mtime"`  // 更新时间，秒级时间戳
	DataID int64  `borm:"did"`    // 数据ID，如果为0，说明没有数据（新创建的文件，DataID就是对象ID，作为对象的首版本数据）
	Type   int    `borm:"type"`   // 对象类型，0: none, 1: dir, 2: file, 3: version, 4: preview(thumb/m3u8/pdf)
	Status int    `borm:"status"` // 对象状态，0: none, 1: normal, 1: deleted, 2: recycle(to be deleted), 3: malformed
	Name   string `borm:"name"`   // 对象名称
	Size   int64  `borm:"size"`   // 对象的大小，目录的大小是子对象数，文件的大小是最新版本的字节数
	Ext    string `borm:"ext"`    // 对象的扩展信息
}
```

### 【数据的属性】

- 是否压缩
- 是否加密
- 原始MD5值
- 原始CRC32值
- 前100KB头部CRC32值
- 8KB对齐，最大尽量在4MB以内
- 打包块的ID和偏移位置

``` go
type DataInfo struct {
	ID       int64  `borm:"id"`        // 数据ID（idgen随机生成的id）
	Size     int64  `borm:"size"`      // 数据的大小
	OrigSize int64  `borm:"o_size"`    // 数据的原始大小
	HdrCRC32 uint32 `borm:"hdr_crc32"` // 头部100KB的CRC32校验值
	CRC32    uint32 `borm:"crc32"`     // 整个数据的CRC32校验值（最原始数据）
	MD5      string `borm:"md5"`       // 整个数据的MD5值（最原始数据）

	Checksum uint32 `borm:"checksum"` // 整个数据的CRC32校验值（最终数据，用于一致性审计）
	Kind     uint32 `borm:"kind"`     // 数据状态，正常、损坏、加密、压缩、类型（用于预览等）

	// PkgID不为0说明是打包数据
	PkgID     int64 `borm:"pkg_id"`  // 打包数据的ID（也是idgen生成的id）
	PkgOffset int   `borm:"pkg_off"` // 打包数据的偏移位置
}
```

PS: 这里的MD5使用的是32位的，按理本可以使用`uint64`存储，以加速匹配时间以及减少存储空间，但是sql driver不支持符号位为1的64位整型数据的读取，所以改为`string`存储。

## 数据设计

数据存储方式和Ceph、Swift以及常见对象存储设计类似，用对象的名称做hash，第一级为hash十六进制字符串的最后三个字符，第二级为hash值，第三级为数据名称，数据名称这里我们设置为`"数据ID-数据块序号SN"`。咱们来分析一下，由于hash的存在，所以即使是同一个数据的多个数据块也不会存储在同一个目录下，三个字母会有4096个组合，也即会均匀分散到四千多个目录里。

```go
// path/<文件名hash的最后三个字节>/hash
func toFilePath(path string, bcktID, dataID int64, sn int) string {
	fileName := fmt.Sprintf("%d_%d", dataID, sn)
	hash := fmt.Sprintf("%X", md5.Sum([]byte(fileName)))
	return filepath.Join(path, fmt.Sprint(bcktID), hash[21:24], hash[8:24], fileName)
}
```

其中，`hash[8:24]`是32位MD5十六进制表示的取值部分，`hash[21:24]`是最后三个字符。

## ID生成方案设计

大致需求：
- 默认单机的，如果是分布式的，可以通过配置redis连接地址来快速支持
- 没有限制ID的生成，可以主动生成后传入，和MongoDB类似
- 生成的ID能够随着时间推移，单调递增

并没有使用数据库主键的方案，这有几个方面的考量，一个是后续扩展为多节点时，用额外的ID生成器便于服务迁移和无缝切换为集群版本；一个是能够自带时间维度的信息。
这里参考MongoDB的对象ID的设计，前半部分是时间戳，后面是实例号和序号，正好和snowflake雪花❄️算法也接近。目前设计的是前40位存储秒级时间戳，中间4位存储实例号，最后20位存储序列号。

具体实现见[orca-zhang/idgen](https://github.com/orca-zhang/idgen)

- TODO：展开说说

## 接口设计

- 批量写入对象信息，同时可以带部分对象的秒传/秒传预筛选
- 读取对象信息
- 读写数据、随机读取数据的一部分（在线播放和在线预览等）
- 列举对象信息：无限加载模式，支持按对象名、对象类型过滤，支持对象名称、大小、时间排序
```go
type ListOptions struct {
	Word  string // 过滤词，支持通配符*和?
	Delim string // 分隔符，每次请求后返回，原样回传即可
	Type  int    // 对象类型，0: 不过滤(default), 1: dir, 2: file, 3: version, 4: preview(thumb/m3u8/pdf)
	Count int    // 查询个数
	Order string // 排序方式，id/mtime/name/size/type 前缀 +: 升序（默认） -: 降序
	Brief int    // 显示更少内容(只在网络传输层，节省流量时有效)，0: FULL(default), 1: without EXT, 2:only ID
}
```

定义接口如下：

```go
type Handler interface {
	// 传入underlying，返回当前的，构成链式调用
	New(h Handler) Handler
	Close()

	SetOptions(opt Options)

	// 只有文件长度、HdrCRC32是预Ref，如果成功返回新DataID，失败返回0
	// 有文件长度、CRC32、MD5，成功返回引用的DataID，失败返回0，客户端发现DataID有变化，说明不需要上传数据
	// 如果非预Ref DataID传0，说明跳过了预Ref
	Ref(c Ctx, bktID int64, d []*DataInfo) ([]int64, error)
	// 打包上传或者小文件，sn传-1，大文件sn从0开始，DataID不传默认创建一个新的
	PutData(c Ctx, bktID, dataID int64, sn int, buf []byte) (int64, error)
	// 只传一个参数说明是sn，传两个参数说明是sn+offset，传三个参数说明是sn+offset+size
	GetData(c Ctx, bktID, id int64, sn int, offset ...int) ([]byte, error)
	// 上传元数据
	PutDataInfo(c Ctx, bktID int64, d []*DataInfo) ([]int64, error)
	// 获取数据信息
	GetDataInfo(c Ctx, bktID, id int64) (*DataInfo, error)
	// 用于非文件内容的扫描，只看文件是否存在，大小是否合适
	FileSize(c Ctx, bktID, dataID int64, sn int) (int64, error)

	// 垃圾回收时有数据没有元数据引用的为脏数据（需要留出窗口时间），有元数据没有数据的为损坏数据
	Put(c Ctx, bktID int64, o []*ObjectInfo) ([]int64, error)
	Get(c Ctx, bktID int64, ids []int64) ([]*ObjectInfo, error)
	List(c Ctx, bktID, pid int64, opt ListOptions) (o []*ObjectInfo, cnt int64, delim string, err error)

	Rename(c Ctx, bktID, id int64, name string) error
	MoveTo(c Ctx, bktID, id, pid int64) error

	Recycle(c Ctx, bktID, id int64) error
	Delete(c Ctx, bktID, id int64) error
}
```

这套接口可以说是整个系统的灵魂所在，未来网络层、多副本、多节点、多集群等都会在这套接口上进行扩展和实现（有可能会有改动和调整）。
- `OrcaS`并没有使用轻客户端、重服务端的方式，而是使用sdk的方式，分摊部分计算和逻辑到客户端完成，从输入端就开始，而不是像平常一样到服务端处理，这样也便于在接口层面做到端到端的统一，对于sdk来说，不需要关心`Handler`是来自哪一层，包括了那些特性，对sdk来说它们看上去都是一样的。在客户端实现打包和组装、加解密和解压缩逻辑，本地的实现是数据直接写入存储；远端的实现是数据通过rpc传输，调用方无法感觉到差别。

### “奇妙”的设计

`Ref`、`PutDataInfo`、`Put`关于负数ID的设计：
- Ref返回的ID如果有负数，说明在同一批中，找到了相同的数据，以下标反码的方式指出，比如引用了第0个元素，那返回就是`^0`，刚好是负数的最小值，以此类推；而在上传对象信息或者数据信息的时候，同样可以引用还未生成ID的其他对象，以实现批量创建一批存在父子关系的对象的效果。

## 上传逻辑

### 过程描述

1. 读取hdrCRC32和大小，来预检查是否可能秒传（可以用阈值来优化小对象直接跳过预检查）
2. 没有可能匹配的直接上传
3. 有可能匹配的，计算整个对象的MD5和CRC32后继续尝试秒传
4. 秒传失败，转普通上传

### 秒传的实现逻辑

如果两个数据的哈希值和长度完全相同，那我们认为他们是完全等同的，那么对象可以使用相同的数据信息（同样的数据ID），为了防止引用过程中可能被同时删除的问题，我们引入一个相对较长的时间窗口即可，需要同时提供MD5和CRC32，是因为存在哈希冲突和漏洞问题。MD5算法选择32位的来减少空间使用，提高匹配效率，虽然这样会增加冲突概率，但是同时会有CRC32存在防止冲突。由于是批量完成的，这里我们用到了小的临时表和元数据表做JOIN的方式实现。

### 展开说说


## 下载逻辑


### 展开说说

## SDK配置详解

``` go
type Config struct {
	DataSync bool   // 断电保护策略(Power-off Protection Policy)，强制每次写入数据后刷到磁盘
	RefLevel uint32 // 秒传级别设置：0: OFF（默认） / 1: Ref / 2: TryRef+Ref
	PkgThres uint32 // 打包个数限制，不设置默认100个
	WiseCmpr uint32 // 智能压缩，根据文件类型决定是否压缩，取值见core.DATA_CMPR_MASK
	EndecWay uint32 // 加密方式，取值见core.DATA_ENDEC_MASK
	EndecKey string // 加密KEY，SM4需要固定为16个字符，AES256需要大于16个字符
	DontSync string // 不同步的文件名通配符（https://pkg.go.dev/path/filepath#Match），用分号分隔
	Conflict uint32 // 同名冲突后，0: Merge or Cover（默认） / 1: Throw / 2: Rename / 3: Skip
	NameTail string // 重命名尾巴，"-副本" / "{\d}"
	ChkPtDir string // 断点续传记录目录，不设置路径默认不开启
	BEDecmpr bool   // 后端解压，PS：必须是非加密数据
}
```

PS：别怀疑，我有强迫症，连配置名字都要搞整齐。

### 展开说说


## 引用文档